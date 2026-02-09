import { ipcMain, dialog, app } from 'electron'
import { SQLiteDriver } from './sqlite'
import { PostgresDriver } from './postgres'
import { ValkeyDriver } from './valkey'
import { getConnections, saveConnection, deleteConnection as deleteStoredConnection } from './connectionStore'
import type {
  DatabaseConnection,
  SQLiteConnection,
  PostgresConnection,
  ValkeyConnection,
  SQLDriver,
  KeyValueDriver,
  SchemaMigrationPlanResponse,
  SchemaMigrationApplyResponse,
  SchemaMigrationResult,
  SchemaMigrationApplyOptions,
  SchemaMigrationOptions,
  ToolAvailabilityResponse,
  BackupListResponse,
  BackupEntry,
  RestoreSqliteBackupResponse
} from './types'
import { IPC_CHANNELS } from './types'
import * as fs from 'fs'
import * as path from 'path'
import { spawn } from 'child_process'

// Active connections store
const connections: Map<string, SQLDriver | KeyValueDriver> = new Map()

// Prevent concurrent schema migrations per target connection
const migrationLocks: Map<string, Promise<void>> = new Map()

async function withMigrationLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const prev = migrationLocks.get(key) ?? Promise.resolve()

  let release: (() => void) | undefined
  const gate = new Promise<void>((resolve) => {
    release = resolve
  })

  const current = prev.then(() => gate)
  migrationLocks.set(key, current)

  await prev
  try {
    return await fn()
  } finally {
    release?.()
    if (migrationLocks.get(key) === current) {
      migrationLocks.delete(key)
    }
  }
}

function quoteIdent(name: string): string {
  // Double-quote and escape embedded quotes
  return `"${String(name).replace(/\"/g, '"').replace(/"/g, '""')}"`
}

function normalizeType(t?: string): string {
  return (t || 'TEXT').toUpperCase().trim()
}

function mapColumnTypeToTarget(sourceType: string, targetType: 'sqlite' | 'postgres'): string {
  const normalized = normalizeType(sourceType)

  if (targetType === 'sqlite') {
    if (normalized.includes('INT')) return 'INTEGER'
    if (normalized.includes('CHAR') || normalized.includes('TEXT') || normalized.includes('CLOB')) return 'TEXT'
    if (normalized.includes('BLOB') || normalized === 'BYTEA') return 'BLOB'
    if (
      normalized.includes('REAL') ||
      normalized.includes('FLOAT') ||
      normalized.includes('DOUBLE') ||
      normalized.includes('NUMERIC') ||
      normalized.includes('DECIMAL')
    )
      return 'REAL'
    if (normalized.includes('BOOL')) return 'INTEGER'
    if (normalized.includes('DATE') || normalized.includes('TIME')) return 'TEXT'
    if (normalized === 'JSON' || normalized === 'JSONB') return 'TEXT'
    if (normalized === 'UUID') return 'TEXT'
    return 'TEXT'
  }

  // postgres
  if (normalized === 'INTEGER' || normalized === 'INT' || normalized.includes('INT')) return 'INTEGER'
  if (normalized === 'BIGINT') return 'BIGINT'
  if (normalized === 'SMALLINT') return 'SMALLINT'
  if (normalized === 'TEXT' || normalized.includes('CLOB')) return 'TEXT'
  if (normalized.includes('VARCHAR') || normalized.includes('CHAR')) return 'VARCHAR(255)'
  if (normalized === 'BLOB' || normalized === 'BYTEA') return 'BYTEA'
  if (normalized === 'REAL' || normalized === 'FLOAT') return 'REAL'
  if (normalized === 'DOUBLE' || normalized === 'DOUBLE PRECISION') return 'DOUBLE PRECISION'
  if (normalized.includes('NUMERIC') || normalized.includes('DECIMAL')) return 'NUMERIC'
  if (normalized.includes('BOOL')) return 'BOOLEAN'
  if (normalized === 'DATE') return 'DATE'
  if (normalized.includes('TIMESTAMP')) return 'TIMESTAMP'
  if (normalized === 'TIME') return 'TIME'
  if (normalized === 'JSON' || normalized === 'JSONB') return 'JSONB'
  if (normalized === 'UUID') return 'UUID'
  return 'TEXT'
}

async function ensureDir(dirPath: string): Promise<void> {
  await fs.promises.mkdir(dirPath, { recursive: true })
}

function getBackupsDir(): string {
  return path.join(app.getPath('userData'), 'backups')
}

function resolveInside(dir: string, filePath: string): string {
  const resolvedDir = path.resolve(dir)
  const resolvedFile = path.resolve(filePath)
  if (!resolvedFile.startsWith(resolvedDir + path.sep) && resolvedFile !== resolvedDir) {
    throw new Error('Path is outside backups directory')
  }
  return resolvedFile
}

function nowStamp(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

async function copyFileAtomic(src: string, dest: string): Promise<void> {
  const tmp = `${dest}.tmp-${process.pid}`
  await fs.promises.copyFile(src, tmp)
  await fs.promises.rename(tmp, dest)
}

async function runPgDump(args: string[], env: Record<string, string | undefined>): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn('pg_dump', args, {
      env: { ...process.env, ...env },
      windowsHide: true
    })

    let stderr = ''
    child.stderr?.on('data', (d) => {
      stderr += String(d)
    })

    child.on('error', (err) => reject(err))
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `pg_dump failed with code ${code}`))
    })
  })
}

async function createBackupIfRequested(
  targetConnectionId: string,
  options: SchemaMigrationApplyOptions | undefined
): Promise<{ backupPath?: string; warning?: string; error?: string }> {
  const driver = getSQLDriver(targetConnectionId)
  const backupsDir = getBackupsDir()
  await ensureDir(backupsDir)

  const requested = options?.createBackup ?? (options as any)?.createSqliteBackup

  if (driver instanceof SQLiteDriver) {
    if (!requested) return {}

    // Ensure current in-memory state is flushed
    driver.flushToDisk()
    const src = driver.getFilePath()
    if (!fs.existsSync(src)) {
      return { error: 'SQLite database file does not exist on disk yet; unable to create backup.' }
    }

    const dest = path.join(backupsDir, `sqlite-${targetConnectionId}-${nowStamp()}.db`)
    await copyFileAtomic(src, dest)
    return { backupPath: dest }
  }

  if (driver instanceof PostgresDriver) {
    // If user asked for a backup on Postgres, we require pg_dump to be available.
    if (!requested) return {}

    const cfg = driver.getBackupConfig()
    const outFile = path.join(backupsDir, `postgres-${targetConnectionId}-${nowStamp()}.sql`)

    const env: Record<string, string | undefined> = {
      PGPASSWORD: cfg.password,
      PGSSLMODE: cfg.ssl ? 'require' : undefined
    }

    const args = [
      '--no-owner',
      '--no-privileges',
      '-h',
      cfg.host,
      '-p',
      String(cfg.port),
      '-U',
      cfg.user,
      '-d',
      cfg.database,
      '-f',
      outFile
    ]

    try {
      await runPgDump(args, env)
      return { backupPath: outFile }
    } catch (error) {
      const msg = (error as Error).message
      // If pg_dump is missing or fails, treat this as an error because the user explicitly requested a backup.
      return { error: `Postgres backup failed: ${msg}. Ensure pg_dump is installed and on PATH.` }
    }
  }

  return {}
}

type SchemaMigrationPlanRequest = {
  sourceConnectionId: string
  targetConnectionId: string
  tables: string[]
  options?: SchemaMigrationOptions
}

async function buildSchemaMigrationPlan(req: SchemaMigrationPlanRequest): Promise<SchemaMigrationResult[]> {
  const source = getSQLDriver(req.sourceConnectionId)
  const target = getSQLDriver(req.targetConnectionId)

  const targetType: 'sqlite' | 'postgres' = target instanceof PostgresDriver ? 'postgres' : 'sqlite'

  const sourceTableInfos = await source.getTables()
  const targetTableInfos = await target.getTables()
  const sourceTables = new Set(sourceTableInfos.map((t) => t.name))
  const targetTables = new Set(targetTableInfos.map((t) => t.name))

  const results: SchemaMigrationResult[] = []

  for (const tableName of req.tables) {
    if (!sourceTables.has(tableName)) {
      results.push({
        table: tableName,
        success: false,
        sql: undefined,
        message: 'Source table not found; skipping.'
      })
      continue
    }

    const srcSchema = await source.getTableSchema(tableName)
    const tgtExists = targetTables.has(tableName)
    const warnings: string[] = []

    if (!tgtExists) {
      const columnsSql = srcSchema
        .map((c) => `${quoteIdent(c.name)} ${mapColumnTypeToTarget(c.type || 'TEXT', targetType)}`)
        .join(',\n    ')
      const sql = `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n    ${columnsSql}\n);`
      results.push({
        table: tableName,
        success: true,
        sql,
        message: 'Will create table',
        warnings: warnings.length ? warnings : undefined
      })
      continue
    }

    const tgtSchema = await target.getTableSchema(tableName)
    const tgtCols = new Map(tgtSchema.map((c) => [c.name, c]))
    const srcCols = new Map(srcSchema.map((c) => [c.name, c]))

    // Only add missing columns (safe + reversible with backup)
    const stmts: string[] = []
    for (const col of srcSchema) {
      const existing = tgtCols.get(col.name)
      if (!existing) {
        const colType = mapColumnTypeToTarget(col.type || 'TEXT', targetType)
        stmts.push(`ALTER TABLE ${quoteIdent(tableName)} ADD COLUMN ${quoteIdent(col.name)} ${colType};`)
      } else {
        const srcType = normalizeType(col.type)
        const tgtType = normalizeType(existing.type)
        if (srcType && tgtType && srcType !== tgtType) {
          warnings.push(`Type mismatch for ${tableName}.${col.name} (source: ${srcType}, target: ${tgtType}). No type changes will be applied.`)
        }
      }
    }

    // Warn if target has extra columns; we never drop.
    for (const col of tgtSchema) {
      if (!srcCols.has(col.name)) {
        warnings.push(`Target has extra column ${tableName}.${col.name}; it will not be removed.`)
      }
    }

    if (stmts.length === 0) {
      results.push({
        table: tableName,
        success: true,
        sql: '-- No changes needed',
        message: 'Table schema is compatible',
        warnings: warnings.length ? warnings : undefined
      })
    } else {
      results.push({
        table: tableName,
        success: true,
        sql: stmts.join('\n'),
        message: 'Will add missing columns',
        warnings: warnings.length ? warnings : undefined
      })
    }
  }

  if (req.options?.fullySync) {
    for (const targetTable of targetTableInfos) {
      if (targetTable.type !== 'table') continue
      if (sourceTables.has(targetTable.name)) continue
      const dropStatement = `DROP TABLE IF EXISTS ${quoteIdent(targetTable.name)};`
      results.push({
        table: targetTable.name,
        success: true,
        sql: dropStatement,
        message: 'Will drop target table that no longer exists in the source'
      })
    }
  }

  return results
}

// Helper to get SQL driver
function getSQLDriver(connectionId: string): SQLDriver {
  const driver = connections.get(connectionId)
  if (!driver) throw new Error(`Connection ${connectionId} not found`)
  if (!('getTables' in driver)) throw new Error('Not a SQL connection')
  return driver as SQLDriver
}

// Helper to get KeyValue driver
function getKeyValueDriver(connectionId: string): KeyValueDriver {
  const driver = connections.get(connectionId)
  if (!driver) throw new Error(`Connection ${connectionId} not found`)
  if (!('scanKeys' in driver)) throw new Error('Not a key-value connection')
  return driver as KeyValueDriver
}

export function registerDatabaseHandlers(): void {
  // Connect to database
  ipcMain.handle('db:connect', async (_event, connection: DatabaseConnection) => {
    try {
      let driver: SQLDriver | KeyValueDriver

      switch (connection.type) {
        case 'sqlite': {
          const sqliteConn = connection as SQLiteConnection
          driver = new SQLiteDriver(sqliteConn.filePath)
          break
        }
        case 'postgres': {
          const pgConn = connection as PostgresConnection
          driver = new PostgresDriver({
            host: pgConn.host,
            port: pgConn.port,
            database: pgConn.database,
            user: pgConn.user,
            password: pgConn.password,
            ssl: pgConn.ssl
          })
          break
        }
        case 'valkey': {
          const valkeyConn = connection as ValkeyConnection
          driver = new ValkeyDriver({
            host: valkeyConn.host,
            port: valkeyConn.port,
            password: valkeyConn.password,
            db: valkeyConn.db
          })
          break
        }
        default:
          throw new Error(`Unknown database type: ${(connection as any).type}`)
      }

      await driver.connect()
      connections.set(connection.id, driver)

      return { success: true, connectionId: connection.id }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Disconnect from database
  ipcMain.handle('db:disconnect', async (_event, connectionId: string) => {
    try {
      const driver = connections.get(connectionId)
      if (driver) {
        await driver.disconnect()
        connections.delete(connectionId)
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Test connection
  ipcMain.handle('db:test-connection', async (_event, connection: DatabaseConnection) => {
    try {
      let driver: SQLDriver | KeyValueDriver

      switch (connection.type) {
        case 'sqlite': {
          const sqliteConn = connection as SQLiteConnection
          driver = new SQLiteDriver(sqliteConn.filePath)
          break
        }
        case 'postgres': {
          const pgConn = connection as PostgresConnection
          driver = new PostgresDriver({
            host: pgConn.host,
            port: pgConn.port,
            database: pgConn.database,
            user: pgConn.user,
            password: pgConn.password,
            ssl: pgConn.ssl
          })
          break
        }
        case 'valkey': {
          const valkeyConn = connection as ValkeyConnection
          driver = new ValkeyDriver({
            host: valkeyConn.host,
            port: valkeyConn.port,
            password: valkeyConn.password,
            db: valkeyConn.db
          })
          break
        }
        default:
          throw new Error(`Unknown database type`)
      }

      await driver.connect()
      await driver.disconnect()
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get tables (SQL databases)
  ipcMain.handle('db:get-tables', async (_event, connectionId: string) => {
    try {
      const driver = getSQLDriver(connectionId)
      const tables = await driver.getTables()
      return { success: true, tables }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get table data
  ipcMain.handle('db:get-table-data', async (
    _event,
    connectionId: string,
    table: string,
    limit?: number,
    offset?: number
  ) => {
    try {
      const driver = getSQLDriver(connectionId)
      const data = await driver.getTableData(table, limit, offset)
      return { success: true, data }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get table schema
  ipcMain.handle('db:get-table-schema', async (_event, connectionId: string, table: string) => {
    try {
      const driver = getSQLDriver(connectionId)
      const schema = await driver.getTableSchema(table)
      return { success: true, schema }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Execute SQL query
  ipcMain.handle('db:execute-query', async (_event, connectionId: string, sql: string) => {
    try {
      const driver = getSQLDriver(connectionId)
      const result = await driver.executeQuery(sql)
      return { success: true, result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Scan keys (Valkey/Redis)
  ipcMain.handle('db:scan-keys', async (_event, connectionId: string, pattern?: string, count?: number) => {
    try {
      const driver = getKeyValueDriver(connectionId)
      const keys = await driver.scanKeys(pattern, count)
      return { success: true, keys }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get key value
  ipcMain.handle('db:get-key-value', async (_event, connectionId: string, key: string) => {
    try {
      const driver = getKeyValueDriver(connectionId)
      const value = await driver.getKeyValue(key)
      const type = await driver.getKeyType(key)
      return { success: true, value, type }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // File picker for SQLite
  ipcMain.handle('db:pick-sqlite-file', async (_event) => {
    const result = await dialog.showOpenDialog({
      title: 'Select SQLite Database',
      filters: [
        { name: 'SQLite Database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] },
        { name: 'All Files', extensions: ['*'] }
      ],
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: false, canceled: true }
    }

    return { success: true, filePath: result.filePaths[0] }
  })

  // Insert a new row into a table
  ipcMain.handle('db:insert-row', async (
    _event,
    connectionId: string,
    table: string,
    row: Record<string, unknown>
  ) => {
    try {
      const driver = getSQLDriver(connectionId)
      const columns = Object.keys(row)
      const values = Object.values(row)
      const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ')
      
      // Build INSERT query
      const sql = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${placeholders})`
      
      // For SQLite, we need to use ? placeholders
      const sqliteSql = `INSERT INTO "${table}" (${columns.map(c => `"${c}"`).join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`
      
      // Execute using raw query with bound parameters
      const result = await driver.executeQuery(
        driver.constructor.name === 'SQLiteDriver' 
          ? sqliteSql.replace(/\?/g, (_, i) => JSON.stringify(values[i] ?? null))
          : sql.replace(/\$\d+/g, (match) => {
              const idx = parseInt(match.slice(1)) - 1
              const val = values[idx]
              if (val === null || val === undefined) return 'NULL'
              if (typeof val === 'string') return `'${val.replace(/'/g, "''")}'`
              if (typeof val === 'number') return String(val)
              return `'${JSON.stringify(val).replace(/'/g, "''")}'`
            })
      )
      
      return { success: true, result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Update a row in a table
  ipcMain.handle('db:update-row', async (
    _event,
    connectionId: string,
    table: string,
    primaryKey: { column: string; value: unknown },
    updates: Record<string, unknown>
  ) => {
    try {
      const driver = getSQLDriver(connectionId)
      
      // Build SET clause
      const setClause = Object.entries(updates)
        .map(([col, val]) => {
          if (val === null || val === undefined) return `"${col}" = NULL`
          if (typeof val === 'string') return `"${col}" = '${val.replace(/'/g, "''")}'`
          if (typeof val === 'number') return `"${col}" = ${val}`
          return `"${col}" = '${JSON.stringify(val).replace(/'/g, "''")}'`
        })
        .join(', ')
      
      // Build WHERE clause for primary key
      let whereValue: string
      if (primaryKey.value === null) {
        whereValue = 'NULL'
      } else if (typeof primaryKey.value === 'string') {
        whereValue = `'${primaryKey.value.replace(/'/g, "''")}'`
      } else {
        whereValue = String(primaryKey.value)
      }
      
      const sql = `UPDATE "${table}" SET ${setClause} WHERE "${primaryKey.column}" = ${whereValue}`
      const result = await driver.executeQuery(sql)
      
      return { success: true, result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Delete a row from a table
  ipcMain.handle('db:delete-row', async (
    _event,
    connectionId: string,
    table: string,
    primaryKey: { column: string; value: unknown }
  ) => {
    try {
      const driver = getSQLDriver(connectionId)
      
      // Build WHERE clause for primary key
      let whereValue: string
      if (primaryKey.value === null) {
        whereValue = 'NULL'
      } else if (typeof primaryKey.value === 'string') {
        whereValue = `'${primaryKey.value.replace(/'/g, "''")}'`
      } else {
        whereValue = String(primaryKey.value)
      }
      
      const sql = `DELETE FROM "${table}" WHERE "${primaryKey.column}" = ${whereValue}`
      const result = await driver.executeQuery(sql)
      
      return { success: true, result }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Get saved connections
  ipcMain.handle('db:get-saved-connections', async () => {
    try {
      const connections = getConnections()
      return { success: true, connections }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Save a connection
  ipcMain.handle('db:save-connection', async (_event, connection: DatabaseConnection) => {
    try {
      saveConnection(connection)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Delete a saved connection
  ipcMain.handle('db:delete-saved-connection', async (_event, connectionId: string) => {
    try {
      deleteStoredConnection(connectionId)
      return { success: true }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Build schema migration plan (safe: only creates tables and adds missing columns)
  ipcMain.handle(IPC_CHANNELS.SCHEMA_MIGRATION_PLAN, async (
    _event,
    req: { sourceConnectionId: string; targetConnectionId: string; tables: string[]; options?: SchemaMigrationOptions }
  ): Promise<SchemaMigrationPlanResponse> => {
    try {
      if (!req?.sourceConnectionId || !req?.targetConnectionId) {
        return { success: false, error: 'sourceConnectionId and targetConnectionId are required' }
      }
      if (!Array.isArray(req.tables) || req.tables.length === 0) {
        return { success: false, error: 'tables must be a non-empty array' }
      }

      const results = await buildSchemaMigrationPlan({
        sourceConnectionId: req.sourceConnectionId,
        targetConnectionId: req.targetConnectionId,
        tables: req.tables,
        options: req.options
      })

      return { success: true, results }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  // Apply schema migration (safe: transactional + optional backup)
  ipcMain.handle(IPC_CHANNELS.SCHEMA_MIGRATION_APPLY, async (
    _event,
    req: {
      sourceConnectionId: string
      targetConnectionId: string
      tables: string[]
      options?: SchemaMigrationApplyOptions
    }
  ): Promise<SchemaMigrationApplyResponse> => {
    const targetConnectionId = req?.targetConnectionId
    if (!targetConnectionId) return { success: false, error: 'targetConnectionId is required' }

    return withMigrationLock(targetConnectionId, async () => {
      try {
        if (!req?.sourceConnectionId) return { success: false, error: 'sourceConnectionId is required' }
        if (!Array.isArray(req.tables) || req.tables.length === 0) {
          return { success: false, error: 'tables must be a non-empty array' }
        }

        const plan = await buildSchemaMigrationPlan({
          sourceConnectionId: req.sourceConnectionId,
          targetConnectionId: req.targetConnectionId,
          tables: req.tables,
          options: req.options
        })

        const actionable = plan.filter((r) => r.success && r.sql && r.sql.trim() && r.sql !== '-- No changes needed')
        if (actionable.length === 0) {
          return { success: true, results: plan }
        }

        const backup = await createBackupIfRequested(targetConnectionId, req.options)
        if (backup.error) {
          return { success: false, error: backup.error }
        }

        const driver = getSQLDriver(targetConnectionId)
        const statements: string[] = []
        for (const r of actionable) {
          statements.push(...(r.sql || '').split(/;\s*\n|;\s*$/g).map((s) => s.trim()).filter(Boolean).map((s) => `${s};`))
        }

        if (driver instanceof SQLiteDriver) {
          await driver.executeTransaction(statements)
        } else if (driver instanceof PostgresDriver) {
          // advisory lock to avoid concurrent schema changes on the same DB
          try {
            await driver.executeQuery('SELECT pg_advisory_lock(314159265)')
          } catch {
            // if lock fails, still proceed; transaction lock will apply
          }

          try {
            await driver.executeTransaction([
              // fail fast rather than hanging forever
              "SET lock_timeout TO '5s'",
              "SET statement_timeout TO '5min'",
              ...statements
            ])
          } finally {
            try {
              await driver.executeQuery('SELECT pg_advisory_unlock(314159265)')
            } catch {
              // ignore
            }
          }
        } else {
          // Should never happen due to getSQLDriver
          throw new Error('Unsupported target driver for schema migration')
        }

        // report all plan rows as success (the whole transaction succeeded)
        const finalResults = plan.map((r) => ({
          ...r,
          success: r.success && true,
          message: r.sql && r.sql !== '-- No changes needed' ? 'Applied' : r.message
        }))

        return { success: true, results: finalResults, backupPath: backup.backupPath }
      } catch (error) {
        return { success: false, error: (error as Error).message }
      }
    })
  })

  // Tool availability checks
  ipcMain.handle(IPC_CHANNELS.PG_DUMP_AVAILABLE, async (): Promise<ToolAvailabilityResponse> => {
    try {
      await new Promise<void>((resolve, reject) => {
        const child = spawn('pg_dump', ['--version'], { windowsHide: true })
        child.on('error', (err) => reject(err))
        child.on('close', (code) => {
          if (code === 0) resolve()
          else reject(new Error(`pg_dump exited with code ${code}`))
        })
      })
      return { success: true, available: true }
    } catch (error) {
      return { success: true, available: false, error: (error as Error).message }
    }
  })

  // Backups
  ipcMain.handle(IPC_CHANNELS.LIST_BACKUPS, async (): Promise<BackupListResponse> => {
    try {
      const backupsDir = getBackupsDir()
      await ensureDir(backupsDir)

      const files = await fs.promises.readdir(backupsDir)
      const entries: BackupEntry[] = []

      for (const fileName of files) {
        const fullPath = path.join(backupsDir, fileName)
        const stat = await fs.promises.stat(fullPath)
        if (!stat.isFile()) continue

        let type: BackupEntry['type'] | null = null
        if (fileName.startsWith('sqlite-') && fileName.endsWith('.db')) type = 'sqlite'
        else if (fileName.startsWith('postgres-') && fileName.endsWith('.sql')) type = 'postgres'
        else continue

        entries.push({
          type,
          path: fullPath,
          fileName,
          createdAt: stat.mtime.toISOString()
        })
      }

      // Newest first
      entries.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))
      return { success: true, backups: entries }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.RESTORE_SQLITE_BACKUP,
    async (
      _event,
      req: { connectionId: string; backupPath: string }
    ): Promise<RestoreSqliteBackupResponse> => {
      const connectionId = req?.connectionId
      if (!connectionId) return { success: false, error: 'connectionId is required' }

      return withMigrationLock(connectionId, async () => {
        try {
          const backupsDir = getBackupsDir()
          await ensureDir(backupsDir)
          const safeBackupPath = resolveInside(backupsDir, req.backupPath)
          if (!fs.existsSync(safeBackupPath)) return { success: false, error: 'Backup file not found' }

          const existing = connections.get(connectionId)
          if (!existing || !(existing instanceof SQLiteDriver)) {
            return { success: false, error: 'Target connection is not an active SQLite connection' }
          }

          const targetFile = existing.getFilePath()
          // Close current DB and remove connection
          await existing.disconnect()
          connections.delete(connectionId)

          // Replace DB file atomically
          const tmp = `${targetFile}.restore-tmp-${process.pid}`
          await fs.promises.copyFile(safeBackupPath, tmp)
          await fs.promises.rename(tmp, targetFile)

          // Reconnect driver under same connectionId
          const driver = new SQLiteDriver(targetFile)
          await driver.connect()
          connections.set(connectionId, driver)

          return { success: true }
        } catch (error) {
          return { success: false, error: (error as Error).message }
        }
      })
    }
  )
}
