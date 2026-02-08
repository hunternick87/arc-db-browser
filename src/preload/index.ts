import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
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

type UpdaterEvent =
  | { type: 'status'; message: string }
  | { type: 'checking-for-update' }
  | { type: 'update-available'; version?: string }
  | { type: 'update-not-available'; version?: string }
  | { type: 'download-progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'update-downloaded'; version?: string }
  | { type: 'error'; message: string }

// Database API for renderer
const databaseAPI = {
  // Connection management
  connect: (connection: DatabaseConnection): Promise<{ success: boolean; connectionId?: string; error?: string }> =>
    ipcRenderer.invoke('db:connect', connection),
  
  disconnect: (connectionId: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('db:disconnect', connectionId),
  
  testConnection: (connection: DatabaseConnection): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('db:test-connection', connection),

  // SQL operations
  getTables: (connectionId: string): Promise<{ success: boolean; tables?: TableInfo[]; error?: string }> =>
    ipcRenderer.invoke('db:get-tables', connectionId),
  
  getTableData: (
    connectionId: string,
    table: string,
    limit?: number,
    offset?: number
  ): Promise<{ success: boolean; data?: QueryResult; error?: string }> =>
    ipcRenderer.invoke('db:get-table-data', connectionId, table, limit, offset),
  
  getTableSchema: (
    connectionId: string,
    table: string
  ): Promise<{ success: boolean; schema?: QueryColumn[]; error?: string }> =>
    ipcRenderer.invoke('db:get-table-schema', connectionId, table),
  
  executeQuery: (
    connectionId: string,
    sql: string
  ): Promise<{ success: boolean; result?: QueryResult; error?: string }> =>
    ipcRenderer.invoke('db:execute-query', connectionId, sql),

  // Key-value operations (Valkey/Redis)
  scanKeys: (
    connectionId: string,
    pattern?: string,
    count?: number
  ): Promise<{ success: boolean; keys?: KeyInfo[]; error?: string }> =>
    ipcRenderer.invoke('db:scan-keys', connectionId, pattern, count),
  
  getKeyValue: (
    connectionId: string,
    key: string
  ): Promise<{ success: boolean; value?: unknown; type?: string; error?: string }> =>
    ipcRenderer.invoke('db:get-key-value', connectionId, key),

  // File picker for SQLite
  pickSqliteFile: (): Promise<{ success: boolean; filePath?: string; canceled?: boolean }> =>
    ipcRenderer.invoke('db:pick-sqlite-file'),

  // CRUD operations
  insertRow: (
    connectionId: string,
    table: string,
    row: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> =>
    ipcRenderer.invoke('db:insert-row', connectionId, table, row),

  updateRow: (
    connectionId: string,
    table: string,
    primaryKey: { column: string; value: unknown },
    updates: Record<string, unknown>
  ): Promise<{ success: boolean; result?: unknown; error?: string }> =>
    ipcRenderer.invoke('db:update-row', connectionId, table, primaryKey, updates),

  deleteRow: (
    connectionId: string,
    table: string,
    primaryKey: { column: string; value: unknown }
  ): Promise<{ success: boolean; result?: unknown; error?: string }> =>
    ipcRenderer.invoke('db:delete-row', connectionId, table, primaryKey),

  // Connection persistence
  getSavedConnections: (): Promise<{ success: boolean; connections?: unknown[]; error?: string }> =>
    ipcRenderer.invoke('db:get-saved-connections'),

  saveStoredConnection: (
    connection: unknown
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('db:save-connection', connection),

  deleteStoredConnection: (
    connectionId: string
  ): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('db:delete-saved-connection', connectionId)

  ,
  // Schema migration (safe backend)
  schemaMigrationPlan: (req: {
    sourceConnectionId: string
    targetConnectionId: string
    tables: string[]
  }): Promise<SchemaMigrationPlanResponse> => ipcRenderer.invoke('db:schema-migration-plan', req),

  schemaMigrationApply: (req: {
    sourceConnectionId: string
    targetConnectionId: string
    tables: string[]
    options?: SchemaMigrationApplyOptions
  }): Promise<SchemaMigrationApplyResponse> => ipcRenderer.invoke('db:schema-migration-apply', req),

  pgDumpAvailable: (): Promise<ToolAvailabilityResponse> => ipcRenderer.invoke('db:pg-dump-available')

  ,
  listBackups: (): Promise<BackupListResponse> => ipcRenderer.invoke('db:list-backups'),
  restoreSqliteBackup: (req: { connectionId: string; backupPath: string }): Promise<RestoreSqliteBackupResponse> =>
    ipcRenderer.invoke('db:restore-sqlite-backup', req)
}

const updaterAPI = {
  isEnabled: (): Promise<boolean> => ipcRenderer.invoke('updater:is-enabled'),
  getAppVersion: (): Promise<string> => ipcRenderer.invoke('updater:get-app-version'),
  checkForUpdates: (): Promise<{ enabled: boolean; updateInfo?: unknown }> => ipcRenderer.invoke('updater:check'),
  downloadUpdate: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('updater:download'),
  quitAndInstall: (): Promise<{ enabled: boolean }> => ipcRenderer.invoke('updater:install'),
  onEvent: (listener: (event: UpdaterEvent) => void): (() => void) => {
    const handler = (_: unknown, event: UpdaterEvent) => listener(event)
    ipcRenderer.on('updater:event', handler)
    return () => ipcRenderer.removeListener('updater:event', handler)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', databaseAPI)
    contextBridge.exposeInMainWorld('updater', updaterAPI)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = databaseAPI
  // @ts-ignore (define in dts)
  window.updater = updaterAPI
}
