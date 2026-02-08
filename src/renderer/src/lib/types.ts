// Shared types for renderer - duplicated from main for isolation
export type DatabaseType = 'sqlite' | 'postgres' | 'valkey'

export interface BaseConnection {
  id: string
  name: string
  type: DatabaseType
}

export interface SQLiteConnection extends BaseConnection {
  type: 'sqlite'
  filePath: string
}

export interface PostgresConnection extends BaseConnection {
  type: 'postgres'
  host: string
  port: number
  database: string
  user: string
  password: string
  ssl?: boolean
}

export interface ValkeyConnection extends BaseConnection {
  type: 'valkey'
  host: string
  port: number
  password?: string
  db?: number
}

export type DatabaseConnection = SQLiteConnection | PostgresConnection | ValkeyConnection

export interface QueryColumn {
  name: string
  type?: string
}

export interface QueryResult {
  columns: QueryColumn[]
  rows: Record<string, unknown>[]
  rowCount: number
  executionTime?: number
}

export interface TableInfo {
  name: string
  type: 'table' | 'view'
  rowCount?: number
}

export interface KeyInfo {
  key: string
  type: 'string' | 'hash' | 'list' | 'set' | 'zset' | 'stream' | 'unknown'
  ttl?: number
}
