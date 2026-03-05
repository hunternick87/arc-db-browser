import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import * as fs from 'fs'
import * as path from 'path'
import type { SQLDriver, TableInfo, QueryResult, QueryColumn } from './types'

let SQL: Awaited<ReturnType<typeof initSqlJs>> | null = null

async function getSqlJs(): Promise<typeof SQL> {
  if (!SQL) {
    SQL = await initSqlJs()
  }
  return SQL
}

export class SQLiteDriver implements SQLDriver {
  private db: SqlJsDatabase | null = null
  private filePath: string
  private dirty = false
  private lastKnownMtimeMs: number | null = null
  private lastKnownSize: number | null = null

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async connect(): Promise<void> {
    const SqlJs = await getSqlJs()
    if (!SqlJs) throw new Error('Failed to initialize SQL.js')

    if (fs.existsSync(this.filePath)) {
      const buffer = fs.readFileSync(this.filePath)
      this.db = new SqlJs.Database(buffer)
      const stats = fs.statSync(this.filePath)
      this.lastKnownMtimeMs = stats.mtimeMs
      this.lastKnownSize = stats.size
    } else {
      // Create new database file
      this.db = new SqlJs.Database()
      this.lastKnownMtimeMs = null
      this.lastKnownSize = null
    }
    this.dirty = false
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      if (this.dirty) {
        this.saveToFile()
      }
      this.db.close()
      this.db = null
      this.dirty = false
    }
  }

  isConnected(): boolean {
    return this.db !== null
  }

  getFilePath(): string {
    return this.filePath
  }

  flushToDisk(): void {
    this.saveToFile()
  }

  async forceReloadFromDisk(): Promise<void> {
    if (!this.db) throw new Error('Not connected')
    if (this.dirty) {
      this.saveToFile()
    }

    const SqlJs = await getSqlJs()
    if (!SqlJs) throw new Error('Failed to initialize SQL.js')

    if (fs.existsSync(this.filePath)) {
      const buffer = fs.readFileSync(this.filePath)
      this.db.close()
      this.db = new SqlJs.Database(buffer)
      const stats = fs.statSync(this.filePath)
      this.lastKnownMtimeMs = stats.mtimeMs
      this.lastKnownSize = stats.size
    } else {
      this.db.close()
      this.db = new SqlJs.Database()
      this.lastKnownMtimeMs = null
      this.lastKnownSize = null
    }

    this.dirty = false
  }

  private async reloadFromDiskIfChanged(): Promise<void> {
    if (!this.db || this.dirty) return
    if (!fs.existsSync(this.filePath)) return

    const stats = fs.statSync(this.filePath)
    const mtimeChanged = this.lastKnownMtimeMs === null || stats.mtimeMs !== this.lastKnownMtimeMs
    const sizeChanged = this.lastKnownSize === null || stats.size !== this.lastKnownSize

    if (!mtimeChanged && !sizeChanged) return

    const SqlJs = await getSqlJs()
    if (!SqlJs) throw new Error('Failed to initialize SQL.js')

    const buffer = fs.readFileSync(this.filePath)
    this.db.close()
    this.db = new SqlJs.Database(buffer)
    this.lastKnownMtimeMs = stats.mtimeMs
    this.lastKnownSize = stats.size
  }

  private saveToFile(): void {
    if (this.db) {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, buffer)
      const stats = fs.statSync(this.filePath)
      this.lastKnownMtimeMs = stats.mtimeMs
      this.lastKnownSize = stats.size
      this.dirty = false
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.db) throw new Error('Not connected')
    await this.reloadFromDiskIfChanged()

    const result = this.db.exec(`
      SELECT name, type 
      FROM sqlite_master 
      WHERE type IN ('table', 'view') 
      AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `)

    if (result.length === 0) return []

    return result[0].values.map(([name, type]) => ({
      name: name as string,
      type: type as 'table' | 'view'
    }))
  }

  async getTableData(table: string, limit = 100, offset = 0): Promise<QueryResult> {
    if (!this.db) throw new Error('Not connected')
    await this.reloadFromDiskIfChanged()

    const startTime = performance.now()
    
    // Sanitize table name to prevent SQL injection
    const safeName = table.replace(/[^a-zA-Z0-9_]/g, '')
    
    const countResult = this.db.exec(`SELECT COUNT(*) FROM "${safeName}"`)
    const rowCount = countResult.length > 0 ? (countResult[0].values[0][0] as number) : 0

    const result = this.db.exec(`SELECT * FROM "${safeName}" LIMIT ${limit} OFFSET ${offset}`)
    
    const executionTime = performance.now() - startTime

    if (result.length === 0) {
      const schema = await this.getTableSchema(table)
      return {
        columns: schema,
        rows: [],
        rowCount,
        executionTime
      }
    }

    const columns: QueryColumn[] = result[0].columns.map(name => ({ name }))
    const rows = result[0].values.map(row => {
      const obj: Record<string, unknown> = {}
      result[0].columns.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj
    })

    return {
      columns,
      rows,
      rowCount,
      executionTime
    }
  }

  async getTableSchema(table: string): Promise<QueryColumn[]> {
    if (!this.db) throw new Error('Not connected')
    await this.reloadFromDiskIfChanged()

    const safeName = table.replace(/[^a-zA-Z0-9_]/g, '')
    const result = this.db.exec(`PRAGMA table_info("${safeName}")`)

    if (result.length === 0) return []

    return result[0].values.map(row => ({
      name: row[1] as string,
      type: row[2] as string
    }))
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.db) throw new Error('Not connected')

    const isModification = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|REPLACE|VACUUM)/i.test(sql)
    if (!isModification) {
      await this.reloadFromDiskIfChanged()
    }

    const startTime = performance.now()
    const result = this.db.exec(sql)
    const executionTime = performance.now() - startTime

    if (isModification) {
      this.dirty = true
      this.saveToFile()
    }

    if (result.length === 0) {
      return {
        columns: [],
        rows: [],
        rowCount: this.db.getRowsModified(),
        executionTime
      }
    }

    const columns: QueryColumn[] = result[0].columns.map(name => ({ name }))
    const rows = result[0].values.map(row => {
      const obj: Record<string, unknown> = {}
      result[0].columns.forEach((col, i) => {
        obj[col] = row[i]
      })
      return obj
    })

    return {
      columns,
      rows,
      rowCount: rows.length,
      executionTime
    }
  }

  async executeTransaction(statements: string[]): Promise<void> {
    if (!this.db) throw new Error('Not connected')

    if (statements.length === 0) return

    try {
      this.db.exec('BEGIN')
      for (const stmt of statements) {
        if (!stmt.trim()) continue
        this.db.exec(stmt)
      }
      this.db.exec('COMMIT')
      this.dirty = true
      this.saveToFile()
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        // ignore rollback errors
      }
      throw error
    }
  }
}
