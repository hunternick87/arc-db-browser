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

  constructor(filePath: string) {
    this.filePath = filePath
  }

  async connect(): Promise<void> {
    const SqlJs = await getSqlJs()
    if (!SqlJs) throw new Error('Failed to initialize SQL.js')

    if (fs.existsSync(this.filePath)) {
      const buffer = fs.readFileSync(this.filePath)
      this.db = new SqlJs.Database(buffer)
    } else {
      // Create new database file
      this.db = new SqlJs.Database()
    }
  }

  async disconnect(): Promise<void> {
    if (this.db) {
      // Save changes before closing
      this.saveToFile()
      this.db.close()
      this.db = null
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

  private saveToFile(): void {
    if (this.db) {
      const data = this.db.export()
      const buffer = Buffer.from(data)
      const dir = path.dirname(this.filePath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.filePath, buffer)
    }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.db) throw new Error('Not connected')

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

    const startTime = performance.now()
    const result = this.db.exec(sql)
    const executionTime = performance.now() - startTime

    // Check if it's a modification query
    const isModification = /^\s*(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(sql)
    if (isModification) {
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
