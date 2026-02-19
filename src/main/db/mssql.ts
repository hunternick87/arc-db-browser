import * as mssql from 'mssql'
import type { SQLDriver, TableInfo, QueryResult, QueryColumn, MSSQLConnection } from './types'

function quotePart(name: string): string {
  return `[${String(name).replace(/\]/g, ']]')}]`
}

function splitTableName(input: string): { schema: string; table: string } {
  const parts = input.split('.')
  if (parts.length >= 2) {
    return {
      schema: parts[0] || 'dbo',
      table: parts.slice(1).join('.')
    }
  }

  return { schema: 'dbo', table: input }
}

export class MSSQLDriver implements SQLDriver {
  private pool: mssql.ConnectionPool | null = null
  private config: Omit<MSSQLConnection, 'id' | 'name' | 'type'>

  constructor(config: Omit<MSSQLConnection, 'id' | 'name' | 'type'>) {
    this.config = config
  }

  async connect(): Promise<void> {
    const pool = new mssql.ConnectionPool({
      server: this.config.host,
      port: this.config.port,
      database: this.config.database,
      user: this.config.user,
      password: this.config.password,
      options: {
        encrypt: this.config.encrypt ?? true,
        trustServerCertificate: this.config.trustServerCertificate ?? true
      }
    })

    this.pool = await pool.connect()
  }

  async disconnect(): Promise<void> {
    if (!this.pool) return
    await this.pool.close()
    this.pool = null
  }

  isConnected(): boolean {
    return this.pool?.connected === true
  }

  async getTables(): Promise<TableInfo[]> {
    if (!this.pool) throw new Error('Not connected')

    const result = await this.pool.request().query(`
      SELECT
        TABLE_SCHEMA as schemaName,
        TABLE_NAME as tableName,
        CASE
          WHEN TABLE_TYPE = 'BASE TABLE' THEN 'table'
          WHEN TABLE_TYPE = 'VIEW' THEN 'view'
          ELSE 'table'
        END as type
      FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_CATALOG = DB_NAME()
      ORDER BY TABLE_SCHEMA, TABLE_NAME
    `)

    return result.recordset.map((row) => ({
      name: `${row.schemaName}.${row.tableName}`,
      type: row.type as 'table' | 'view'
    }))
  }

  async getTableData(table: string, limit = 100, offset = 0): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')

    const startTime = performance.now()
    const { schema, table: tableName } = splitTableName(table)
    const safeSchema = quotePart(schema)
    const safeTable = quotePart(tableName)

    const countResult = await this.pool
      .request()
      .query(`SELECT COUNT(*) as count FROM ${safeSchema}.${safeTable}`)

    const rowCount = Number(countResult.recordset[0]?.count ?? 0)

    const dataResult = await this.pool.request().query(`
      SELECT *
      FROM ${safeSchema}.${safeTable}
      ORDER BY (SELECT NULL)
      OFFSET ${Math.max(offset, 0)} ROWS
      FETCH NEXT ${Math.max(limit, 1)} ROWS ONLY
    `)

    const executionTime = performance.now() - startTime

    const recordsetColumns = Object.values(dataResult.recordset.columns || {}) as Array<{ name: string; type?: { name?: string } }>
    const columns: QueryColumn[] = recordsetColumns.map((col) => ({
      name: col.name,
      type: col.type?.name
    }))

    return {
      columns,
      rows: dataResult.recordset,
      rowCount,
      executionTime
    }
  }

  async getTableSchema(table: string): Promise<QueryColumn[]> {
    if (!this.pool) throw new Error('Not connected')

    const { schema, table: tableName } = splitTableName(table)

    const result = await this.pool.request()
      .input('schemaName', mssql.NVarChar, schema)
      .input('tableName', mssql.NVarChar, tableName)
      .query(`
        SELECT
          COLUMN_NAME as name,
          DATA_TYPE as type
        FROM INFORMATION_SCHEMA.COLUMNS
        WHERE TABLE_SCHEMA = @schemaName
          AND TABLE_NAME = @tableName
        ORDER BY ORDINAL_POSITION
      `)

    return result.recordset.map((row) => ({
      name: row.name,
      type: row.type
    }))
  }

  async executeQuery(sql: string): Promise<QueryResult> {
    if (!this.pool) throw new Error('Not connected')

    const startTime = performance.now()
    const result = await this.pool.request().query(sql)
    const executionTime = performance.now() - startTime

    const recordsetColumns = Object.values(result.recordset?.columns || {}) as Array<{ name: string; type?: { name?: string } }>
    const columns: QueryColumn[] = recordsetColumns.map((col) => ({
      name: col.name,
      type: col.type?.name
    }))

    const rows = result.recordset || []
    const rowCount = rows.length > 0
      ? rows.length
      : (result.rowsAffected || []).reduce((sum, value) => sum + value, 0)

    return {
      columns,
      rows,
      rowCount,
      executionTime
    }
  }
}
