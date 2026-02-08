import { Client } from 'pg'
import type { SQLDriver, TableInfo, QueryResult, QueryColumn, PostgresConnection } from './types'

export class PostgresDriver implements SQLDriver {
  private client: Client | null = null
  private config: Omit<PostgresConnection, 'id' | 'name' | 'type'>

  constructor(config: Omit<PostgresConnection, 'id' | 'name' | 'type'>) {
    this.config = config
  }

  async connect(): Promise<void> {
    this.client = new Client({
      host: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      ssl: this.config.ssl ? { rejectUnauthorized: false } : false
    })

    await this.client.connect()
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.end()
      this.client = null
    }
  }

  isConnected(): boolean {
    return this.client !== null
  }

  getBackupConfig(): Omit<PostgresConnection, 'id' | 'name' | 'type'> {
    return { ...this.config }
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.client) throw new Error('Not connected')

    const result = await this.client.query(`
      SELECT 
        table_name as name,
        CASE table_type 
          WHEN 'BASE TABLE' THEN 'table'
          WHEN 'VIEW' THEN 'view'
          ELSE 'table'
        END as type
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `)

    return result.rows.map(row => ({
      name: row.name,
      type: row.type as 'table' | 'view'
    }))
  }

  async getTableData(table: string, limit = 100, offset = 0): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected')

    const startTime = performance.now()

    // Get row count
    const countResult = await this.client.query(
      `SELECT COUNT(*) FROM "${table}"`
    )
    const rowCount = parseInt(countResult.rows[0].count, 10)

    // Get data
    const result = await this.client.query(
      `SELECT * FROM "${table}" LIMIT $1 OFFSET $2`,
      [limit, offset]
    )

    const executionTime = performance.now() - startTime

    const columns: QueryColumn[] = result.fields.map(field => ({
      name: field.name,
      type: field.dataTypeID?.toString()
    }))

    return {
      columns,
      rows: result.rows,
      rowCount,
      executionTime
    }
  }

  async getTableSchema(table: string): Promise<QueryColumn[]> {
    if (!this.client) throw new Error('Not connected')

    const result = await this.client.query(`
      SELECT 
        column_name as name,
        data_type as type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
      ORDER BY ordinal_position
    `, [table])

    return result.rows.map(row => ({
      name: row.name,
      type: row.type
    }))
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.client) throw new Error('Not connected')

    const startTime = performance.now()
    const result = await this.client.query(sql)
    const executionTime = performance.now() - startTime

    const columns: QueryColumn[] = result.fields?.map(field => ({
      name: field.name,
      type: field.dataTypeID?.toString()
    })) || []

    return {
      columns,
      rows: result.rows || [],
      rowCount: result.rowCount || 0,
      executionTime
    }
  }

  async executeTransaction(statements: string[]): Promise<void> {
    if (!this.client) throw new Error('Not connected')
    if (statements.length === 0) return

    await this.client.query('BEGIN')
    try {
      for (const stmt of statements) {
        if (!stmt.trim()) continue
        await this.client.query(stmt)
      }
      await this.client.query('COMMIT')
    } catch (error) {
      try {
        await this.client.query('ROLLBACK')
      } catch {
        // ignore rollback errors
      }
      throw error
    }
  }
}
