// Database connection and query types
export type DatabaseType = 'sqlite' | 'postgres' | 'valkey'

export interface BaseConnection {
  id: string
  name: string
  type: DatabaseType
  metadata?: Record<string, unknown>
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

// Query results
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

// Table/key info
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

// Schema migration
export interface SchemaMigrationResult {
  table: string
  success: boolean
  sql?: string
  message?: string
  warnings?: string[]
}

export interface SchemaMigrationPlanResponse {
  success: boolean
  results?: SchemaMigrationResult[]
  error?: string
}

export interface SchemaMigrationOptions {
  fullySync?: boolean
}

export interface SchemaMigrationApplyOptions extends SchemaMigrationOptions {
  createBackup?: boolean
}

export interface SchemaMigrationApplyResponse {
  success: boolean
  results?: SchemaMigrationResult[]
  backupPath?: string
  error?: string
}

export interface ToolAvailabilityResponse {
  success: boolean
  available: boolean
  error?: string
}

export type BackupType = 'sqlite' | 'postgres'

export interface BackupEntry {
  type: BackupType
  path: string
  fileName: string
  createdAt?: string
}

export interface BackupListResponse {
  success: boolean
  backups?: BackupEntry[]
  error?: string
}

export interface RestoreSqliteBackupResponse {
  success: boolean
  error?: string
}

// Driver interface
export interface DatabaseDriver {
  connect(): Promise<void>
  disconnect(): Promise<void>
  isConnected(): boolean
}

export interface SQLDriver extends DatabaseDriver {
  getTables(): Promise<TableInfo[]>
  getTableData(table: string, limit?: number, offset?: number): Promise<QueryResult>
  executeQuery(sql: string): Promise<QueryResult>
  getTableSchema(table: string): Promise<QueryColumn[]>
}

export interface KeyValueDriver extends DatabaseDriver {
  scanKeys(pattern?: string, count?: number): Promise<KeyInfo[]>
  getKeyValue(key: string): Promise<unknown>
  getKeyType(key: string): Promise<string>
}

// IPC Channel names
export const IPC_CHANNELS = {
  // Connection management
  CONNECT: 'db:connect',
  DISCONNECT: 'db:disconnect',
  TEST_CONNECTION: 'db:test-connection',
  
  // SQL operations
  GET_TABLES: 'db:get-tables',
  GET_TABLE_DATA: 'db:get-table-data',
  GET_TABLE_SCHEMA: 'db:get-table-schema',
  EXECUTE_QUERY: 'db:execute-query',
  
  // Key-value operations
  SCAN_KEYS: 'db:scan-keys',
  GET_KEY_VALUE: 'db:get-key-value',

  // Schema migration
  SCHEMA_MIGRATION_PLAN: 'db:schema-migration-plan',
  SCHEMA_MIGRATION_APPLY: 'db:schema-migration-apply',

  // Tooling
  PG_DUMP_AVAILABLE: 'db:pg-dump-available',

  // Backups
  LIST_BACKUPS: 'db:list-backups',
  RESTORE_SQLITE_BACKUP: 'db:restore-sqlite-backup'
} as const
