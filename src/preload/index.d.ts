import { ElectronAPI } from '@electron-toolkit/preload'
import type {
  DatabaseConnection,
  QueryResult,
  TableInfo,
  KeyInfo,
  QueryColumn,
  SchemaMigrationPlanResponse,
  SchemaMigrationApplyResponse,
  SchemaMigrationApplyOptions,
  ToolAvailabilityResponse,
  BackupListResponse,
  RestoreSqliteBackupResponse
} from '../main/db/types'

interface DatabaseAPI {
  connect: (connection: DatabaseConnection) => Promise<{ success: boolean; connectionId?: string; error?: string }>
  disconnect: (connectionId: string) => Promise<{ success: boolean; error?: string }>
  testConnection: (connection: DatabaseConnection) => Promise<{ success: boolean; error?: string }>
  getTables: (connectionId: string) => Promise<{ success: boolean; tables?: TableInfo[]; error?: string }>
  getTableData: (
    connectionId: string,
    table: string,
    limit?: number,
    offset?: number
  ) => Promise<{ success: boolean; data?: QueryResult; error?: string }>
  getTableSchema: (
    connectionId: string,
    table: string
  ) => Promise<{ success: boolean; schema?: QueryColumn[]; error?: string }>
  executeQuery: (
    connectionId: string,
    sql: string
  ) => Promise<{ success: boolean; result?: QueryResult; error?: string }>
  scanKeys: (
    connectionId: string,
    pattern?: string,
    count?: number
  ) => Promise<{ success: boolean; keys?: KeyInfo[]; error?: string }>
  getKeyValue: (
    connectionId: string,
    key: string
  ) => Promise<{ success: boolean; value?: unknown; type?: string; error?: string }>
  pickSqliteFile: () => Promise<{ success: boolean; filePath?: string; canceled?: boolean }>
  insertRow: (
    connectionId: string,
    table: string,
    row: Record<string, unknown>
  ) => Promise<{ success: boolean; result?: unknown; error?: string }>
  updateRow: (
    connectionId: string,
    table: string,
    primaryKey: { column: string; value: unknown },
    updates: Record<string, unknown>
  ) => Promise<{ success: boolean; result?: unknown; error?: string }>
  deleteRow: (
    connectionId: string,
    table: string,
    primaryKey: { column: string; value: unknown }
  ) => Promise<{ success: boolean; result?: unknown; error?: string }>
  getSavedConnections: () => Promise<{ success: boolean; connections?: DatabaseConnection[]; error?: string }>
  saveStoredConnection: (connection: DatabaseConnection) => Promise<{ success: boolean; error?: string }>
  deleteStoredConnection: (connectionId: string) => Promise<{ success: boolean; error?: string }>

  schemaMigrationPlan: (req: {
    sourceConnectionId: string
    targetConnectionId: string
    tables: string[]
  }) => Promise<SchemaMigrationPlanResponse>

  schemaMigrationApply: (req: {
    sourceConnectionId: string
    targetConnectionId: string
    tables: string[]
    options?: SchemaMigrationApplyOptions
  }) => Promise<SchemaMigrationApplyResponse>

  pgDumpAvailable: () => Promise<ToolAvailabilityResponse>

  listBackups: () => Promise<BackupListResponse>
  restoreSqliteBackup: (req: { connectionId: string; backupPath: string }) => Promise<RestoreSqliteBackupResponse>
}

type UpdaterEvent =
  | { type: 'status'; message: string }
  | { type: 'checking-for-update' }
  | { type: 'update-available'; version?: string }
  | { type: 'update-not-available'; version?: string }
  | { type: 'download-progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'update-downloaded'; version?: string }
  | { type: 'error'; message: string }

interface UpdaterAPI {
  isEnabled: () => Promise<boolean>
  getAppVersion: () => Promise<string>
  checkForUpdates: () => Promise<{ enabled: boolean; updateInfo?: unknown }>
  downloadUpdate: () => Promise<{ enabled: boolean }>
  quitAndInstall: () => Promise<{ enabled: boolean }>
  onEvent: (listener: (event: UpdaterEvent) => void) => () => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: DatabaseAPI
    updater: UpdaterAPI
  }
}
