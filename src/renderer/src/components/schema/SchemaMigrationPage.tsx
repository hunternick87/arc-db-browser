import { useState, useMemo, useCallback, useEffect } from 'react'
import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Checkbox } from '@/components/ui/checkbox'
import { useConnection } from '@/contexts/ConnectionContext'
import {
    Loader2,
    Database,
    ArrowLeft,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Table2,
    Play,
    Eye,
    Plug,
    Plus,
    Minus,
    RefreshCw,
    ArrowRight
} from 'lucide-react'

interface SchemaMigrationPageProps {
    onBack: () => void
}

type ConnectionStatus = 'idle' | 'testing' | 'connected' | 'error'

interface SchemaColumn {
    name: string
    type: string
    nullable?: boolean
    primaryKey?: boolean
    defaultValue?: string
}

interface TableSchema {
    name: string
    columns: SchemaColumn[]
    exists: boolean
}

interface SchemaDiff {
    tableName: string
    sourceColumns: SchemaColumn[]
    targetColumns: SchemaColumn[]
    action: 'create' | 'modify' | 'skip'
    changes: ColumnChange[]
}

interface ColumnChange {
    column: string
    type: 'add' | 'remove' | 'modify'
    sourceType?: string
    targetType?: string
}

interface MigrationResult {
    table: string
    success: boolean
    sql?: string
    message?: string
    warnings?: string[]
}

export function SchemaMigrationPage({ onBack }: SchemaMigrationPageProps): React.JSX.Element {
    const { connections } = useConnection()

    // Only show SQL databases (sqlite, postgres)
    const sqlConnections = useMemo(
        () => connections.filter(c => c.type === 'sqlite' || c.type === 'postgres'),
        [connections]
    )

    // Connection state
    const [sourceId, setSourceId] = useState<string>('')
    const [targetId, setTargetId] = useState<string>('')
    const [sourceStatus, setSourceStatus] = useState<ConnectionStatus>('idle')
    const [targetStatus, setTargetStatus] = useState<ConnectionStatus>('idle')
    const [sourceError, setSourceError] = useState<string | null>(null)
    const [targetError, setTargetError] = useState<string | null>(null)

    // Schema state
    const [sourceSchemas, setSourceSchemas] = useState<TableSchema[]>([])
    const [targetSchemas, setTargetSchemas] = useState<TableSchema[]>([])
    const [selectedTables, setSelectedTables] = useState<Set<string>>(new Set())
    const [schemaDiffs, setSchemaDiffs] = useState<SchemaDiff[]>([])
    const [isLoadingDiff, setIsLoadingDiff] = useState(false)

    // Migration state
    const [isDryRun, setIsDryRun] = useState(false)
    const [dryRunResults, setDryRunResults] = useState<MigrationResult[]>([])
    const [migrationResults, setMigrationResults] = useState<MigrationResult[]>([])
    const [isMigrating, setIsMigrating] = useState(false)
    const [showConfirmDialog, setShowConfirmDialog] = useState(false)
    const [confirmText, setConfirmText] = useState('')
    const [createBackup, setCreateBackup] = useState(false)
    const [fullySync, setFullySync] = useState(false)
    const [lastBackupPath, setLastBackupPath] = useState<string | null>(null)
    const [pgDumpAvailable, setPgDumpAvailable] = useState<boolean | null>(null)
    const [isRestoringBackup, setIsRestoringBackup] = useState(false)

    const sourceConnection = useMemo(
        () => sqlConnections.find(c => c.id === sourceId),
        [sqlConnections, sourceId]
    )

    const targetConnection = useMemo(
        () => sqlConnections.find(c => c.id === targetId),
        [sqlConnections, targetId]
    )

    const extraTargetTables = useMemo(() => {
        const sourceSet = new Set(sourceSchemas.map(schema => schema.name))
        return targetSchemas.filter(table => !sourceSet.has(table.name))
    }, [sourceSchemas, targetSchemas])

    const CONFIRM_PHRASE = 'yes i am totally sure'

    useEffect(() => {
        setCreateBackup(targetConnection?.type === 'sqlite')
        setLastBackupPath(null)
        setPgDumpAvailable(null)
        setFullySync(false)
    }, [targetConnection?.id, targetConnection?.type])

    useEffect(() => {
        if (!targetConnection || targetConnection.type !== 'postgres') return

        let cancelled = false
        const fn = (window.api as any)?.pgDumpAvailable
        if (typeof fn !== 'function') {
            // Likely dev preload hot-reload not applied yet; avoid crashing.
            setPgDumpAvailable(false)
            setCreateBackup(false)
            return
        }

        fn()
            .then((res: { available: boolean }) => {
                if (cancelled) return
                setPgDumpAvailable(Boolean(res.available))
                if (!res.available) setCreateBackup(false)
            })
            .catch(() => {
                if (cancelled) return
                setPgDumpAvailable(false)
                setCreateBackup(false)
            })

        return () => {
            cancelled = true
        }
    }, [targetConnection?.id, targetConnection?.type])

    // Test connection
    const testConnection = useCallback(async (type: 'source' | 'target') => {
        const id = type === 'source' ? sourceId : targetId
        const connection = type === 'source' ? sourceConnection : targetConnection
        const setStatus = type === 'source' ? setSourceStatus : setTargetStatus
        const setErrorFn = type === 'source' ? setSourceError : setTargetError
        const setSchemas = type === 'source' ? setSourceSchemas : setTargetSchemas

        if (!connection) return

        setStatus('testing')
        setErrorFn(null)

        try {
            const testResult = await window.api.testConnection(connection)
            if (!testResult.success) {
                throw new Error(testResult.error || 'Connection test failed')
            }

            const connectResult = await window.api.connect(connection)
            if (!connectResult.success) {
                throw new Error(connectResult.error || 'Failed to connect')
            }

            const tablesResult = await window.api.getTables(id)
            if (!tablesResult.success) {
                throw new Error(tablesResult.error || 'Failed to get tables')
            }

            const schemas: TableSchema[] = []
            for (const table of tablesResult.tables || []) {
                const schemaResult = await window.api.getTableSchema(id, table.name)
                schemas.push({
                    name: table.name,
                    columns: (schemaResult.schema || []).map(col => ({
                        name: col.name,
                        type: col.type || 'TEXT'
                    })),
                    exists: true
                })
            }

            setSchemas(schemas)
            setStatus('connected')

            if (type === 'source') {
                setSelectedTables(new Set(schemas.map(s => s.name)))
            }
        } catch (err) {
            setErrorFn((err as Error).message)
            setStatus('error')
        }
    }, [sourceId, targetId, sourceConnection, targetConnection])

    // Generate diffs
    const generateDiffs = useCallback(async () => {
        if (sourceStatus !== 'connected' || targetStatus !== 'connected') return
        if (selectedTables.size === 0) return

        setIsLoadingDiff(true)
        setDryRunResults([])
        setMigrationResults([])

        const diffs: SchemaDiff[] = []

        for (const tableName of selectedTables) {
            const sourceSchema = sourceSchemas.find(s => s.name === tableName)
            const targetSchema = targetSchemas.find(s => s.name === tableName)

            if (!sourceSchema) continue

            const changes: ColumnChange[] = []

            if (!targetSchema) {
                for (const col of sourceSchema.columns) {
                    changes.push({
                        column: col.name,
                        type: 'add',
                        sourceType: col.type
                    })
                }
                diffs.push({
                    tableName,
                    sourceColumns: sourceSchema.columns,
                    targetColumns: [],
                    action: 'create',
                    changes
                })
            } else {
                const targetColMap = new Map(targetSchema.columns.map(c => [c.name, c]))
                const sourceColMap = new Map(sourceSchema.columns.map(c => [c.name, c]))

                for (const col of sourceSchema.columns) {
                    const targetCol = targetColMap.get(col.name)
                    if (!targetCol) {
                        changes.push({
                            column: col.name,
                            type: 'add',
                            sourceType: col.type
                        })
                    } else if (col.type.toLowerCase() !== targetCol.type.toLowerCase()) {
                        changes.push({
                            column: col.name,
                            type: 'modify',
                            sourceType: col.type,
                            targetType: targetCol.type
                        })
                    }
                }

                for (const col of targetSchema.columns) {
                    if (!sourceColMap.has(col.name)) {
                        changes.push({
                            column: col.name,
                            type: 'remove',
                            targetType: col.type
                        })
                    }
                }

                diffs.push({
                    tableName,
                    sourceColumns: sourceSchema.columns,
                    targetColumns: targetSchema.columns,
                    action: changes.length > 0 ? 'modify' : 'skip',
                    changes
                })
            }
        }

        setSchemaDiffs(diffs)
        setIsLoadingDiff(false)
    }, [sourceStatus, targetStatus, selectedTables, sourceSchemas, targetSchemas])

    const handleFullySyncToggle = useCallback((value?: boolean) => {
        const next = typeof value === 'boolean' ? value : !fullySync
        setFullySync(next)
        setSchemaDiffs([])
        setDryRunResults([])
        setMigrationResults([])
    }, [fullySync])

    // Dry run
    const handleDryRun = useCallback(async () => {
        if (!targetConnection || !sourceId || !targetId) return

        setIsDryRun(true)
        setDryRunResults([])
        setLastBackupPath(null)

        try {
            const planFn = (window.api as any)?.schemaMigrationPlan
            if (typeof planFn !== 'function') {
                setDryRunResults([
                    {
                        table: '(plan)',
                        success: false,
                        message:
                            'Migration API is not available in the preload bridge. Fully restart the Electron app (preload does not always hot-reload in dev).'
                    }
                ])
                return
            }

            const res = await planFn({
                sourceConnectionId: sourceId,
                targetConnectionId: targetId,
                tables: Array.from(selectedTables),
                options: { fullySync }
            })

            if (!res.success) {
                setDryRunResults([
                    {
                        table: '(plan)',
                        success: false,
                        message: res.error || 'Failed to build migration plan'
                    }
                ])
            } else {
                setDryRunResults(
                    (res.results || []).map(r => ({
                        table: r.table,
                        success: r.success,
                        sql: r.sql,
                        message: r.message,
                        warnings: r.warnings
                    }))
                )
            }
        } catch (err) {
            setDryRunResults([
                {
                    table: '(plan)',
                    success: false,
                    message: (err as Error).message
                }
            ])
        } finally {
            setIsDryRun(false)
        }
    }, [targetConnection, sourceId, targetId, selectedTables, fullySync])

    // Actual migration
    const handleMigrate = useCallback(async () => {
        if (!targetConnection || !sourceId || !targetId) return

        setShowConfirmDialog(false)
        setConfirmText('')
        setIsMigrating(true)
        setMigrationResults([])
        setLastBackupPath(null)

        try {
            const applyFn = (window.api as any)?.schemaMigrationApply
            if (typeof applyFn !== 'function') {
                setMigrationResults([
                    {
                        table: '(apply)',
                        success: false,
                        message:
                            'Migration API is not available in the preload bridge. Fully restart the Electron app (preload does not always hot-reload in dev).'
                    }
                ])
                return
            }

            const res = await applyFn({
                sourceConnectionId: sourceId,
                targetConnectionId: targetId,
                tables: Array.from(selectedTables),
                options: { createBackup, fullySync }
            })

            if (!res.success) {
                setMigrationResults([
                    {
                        table: '(apply)',
                        success: false,
                        message: res.error || 'Migration failed'
                    }
                ])
            } else {
                setMigrationResults(
                    (res.results || []).map(r => ({
                        table: r.table,
                        success: r.success,
                        sql: r.sql,
                        message: r.message,
                        warnings: r.warnings
                    }))
                )
                if (res.backupPath) setLastBackupPath(res.backupPath)
            }
        } catch (err) {
            setMigrationResults([
                {
                    table: '(apply)',
                    success: false,
                    message: (err as Error).message
                }
            ])
        } finally {
            setIsMigrating(false)
        }
    }, [targetConnection, sourceId, targetId, selectedTables, createBackup, fullySync])

    const handleTableToggle = (tableName: string) => {
        setSelectedTables(prev => {
            const next = new Set(prev)
            if (next.has(tableName)) {
                next.delete(tableName)
            } else {
                next.add(tableName)
            }
            return next
        })
        setSchemaDiffs([])
        setDryRunResults([])
        setMigrationResults([])
    }

    const handleSelectAll = () => {
        if (selectedTables.size === sourceSchemas.length) {
            setSelectedTables(new Set())
        } else {
            setSelectedTables(new Set(sourceSchemas.map(s => s.name)))
        }
        setSchemaDiffs([])
        setDryRunResults([])
        setMigrationResults([])
    }

    const canGenerateDiff = sourceStatus === 'connected' && targetStatus === 'connected' && selectedTables.size > 0
    const hasSchemaChanges = schemaDiffs.length > 0 && schemaDiffs.some(d => d.action !== 'skip')
    const readyForFullySync = fullySync && extraTargetTables.length > 0 && sourceStatus === 'connected' && targetStatus === 'connected'
    const canDryRun = hasSchemaChanges || readyForFullySync
    const canMigrate = dryRunResults.length > 0 && dryRunResults.some(r => r.sql && r.sql !== '-- No changes needed')

    const changesCount = schemaDiffs.filter(d => d.action !== 'skip').length
    const skipCount = schemaDiffs.filter(d => d.action === 'skip').length

    return (
        <>
            <SidebarInset className="flex flex-col flex-1 overflow-hidden min-w-0">
                {/* Header */}
                <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
                    <SidebarTrigger className="-ml-1" />
                    <Separator orientation="vertical" className="h-6" />
                    <Button variant="ghost" size="sm" onClick={onBack} className="gap-2">
                        <ArrowLeft className="h-4 w-4" />
                        Back
                    </Button>
                    <Separator orientation="vertical" className="h-6" />
                    <div className="flex items-center gap-2 flex-1">
                        <Database className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">Schema Migration</span>
                    </div>
                </header>

                {/* Main Content with Right Sidebar */}
                <div className="flex-1 flex overflow-hidden">
                    {/* Main Diff View Area */}
                    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                        <ScrollArea className="flex-1 overflow-scroll">
                            <div className="p-6 space-y-4">
                                {/* Empty State */}
                                {schemaDiffs.length === 0 && !isLoadingDiff && (
                                    <div className="flex flex-col items-center justify-center py-20 text-center">
                                        <Database className="h-16 w-16 text-muted-foreground/30 mb-4" />
                                        <h3 className="text-lg font-medium text-muted-foreground mb-2">
                                            No Schema Diff Generated
                                        </h3>
                                        <p className="text-sm text-muted-foreground max-w-md">
                                            Select source and target databases, test connections, choose tables,
                                            and click "Generate Diff" to see the schema differences.
                                        </p>
                                    </div>
                                )}

                                {/* Loading State */}
                                {isLoadingDiff && (
                                    <div className="flex items-center justify-center py-20">
                                        <Loader2 className="h-8 w-8 animate-spin text-primary" />
                                        <span className="ml-3 text-muted-foreground">Analyzing schemas...</span>
                                    </div>
                                )}

                                {/* Schema Diff Results */}
                                {schemaDiffs.length > 0 && (
                                    <>
                                        {/* Summary Bar */}
                                        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg border">
                                            <span className="text-sm font-medium">Summary:</span>
                                            {changesCount > 0 && (
                                                <Badge variant="default" className="bg-amber-500">
                                                    {changesCount} table(s) with changes
                                                </Badge>
                                            )}
                                            {skipCount > 0 && (
                                                <Badge variant="outline">
                                                    {skipCount} table(s) identical
                                                </Badge>
                                            )}
                                            {extraTargetTables.length > 0 && (
                                                <Badge variant="destructive" className="text-xs">
                                                    {extraTargetTables.length} extra table(s) on target
                                                </Badge>
                                            )}
                                        </div>

                                        <div className="h-px bg-transparent py-2" />

                                        {extraTargetTables.length > 0 && sourceStatus === 'connected' && targetStatus === 'connected' && (
                                            <div className="space-y-3 p-4 rounded-lg border border-destructive/50 bg-destructive/10 text-destructive">
                                                <div className="flex items-center gap-2 text-sm font-medium">
                                                    <AlertTriangle className="h-4 w-4" />
                                                    <span>Target-only tables detected</span>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    These tables exist in <strong>{targetConnection?.name}</strong> but no longer exist in the source schema.
                                                    Enable <span className="font-medium">Fully sync schema</span> in the sidebar to drop them safely.
                                                </p>
                                                <div className="h-px bg-transparent py-2" />
                                                <div className="space-y-1 gap-2 flex flex-col">
                                                    {extraTargetTables.map(table => (
                                                        <div
                                                            key={table.name}
                                                            className="flex items-center gap-2 px-3 py-2 rounded border border-destructive/60 bg-destructive/5 text-destructive text-xs"
                                                        >
                                                            <Table2 className="h-3.5 w-3.5" />
                                                            <span className="truncate">{table.name}</span>
                                                            <Badge variant="destructive" className="text-[10px] ml-auto uppercase text-gray-400">
                                                                Target only
                                                            </Badge>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="h-px bg-transparent py-2" />

                                        {/* Diff Cards */}
                                        <div className="space-y-3 gap-3 flex flex-col">
                                            {schemaDiffs.map(diff => (
                                                <div
                                                    key={diff.tableName}
                                                    className="border rounded-lg overflow-hidden bg-card"
                                                >
                                                    {/* Table Header */}
                                                    <div className={`px-4 py-3 flex items-center justify-between ${diff.action === 'create'
                                                            ? 'bg-green-500/10 border-b border-green-500/20'
                                                            : diff.action === 'modify'
                                                                ? 'bg-amber-500/10 border-b border-amber-500/20'
                                                                : 'bg-muted/50 border-b'
                                                        }`}>
                                                        <div className="flex items-center gap-2">
                                                            <Table2 className="h-4 w-4" />
                                                            <span className="font-medium font-mono">{diff.tableName}</span>
                                                        </div>
                                                        <Badge
                                                            variant={
                                                                diff.action === 'create'
                                                                    ? 'default'
                                                                    : diff.action === 'modify'
                                                                        ? 'secondary'
                                                                        : 'outline'
                                                            }
                                                            className={
                                                                diff.action === 'create'
                                                                    ? 'bg-green-500'
                                                                    : diff.action === 'modify'
                                                                        ? 'bg-amber-500'
                                                                        : ''
                                                            }
                                                        >
                                                            {diff.action === 'create' ? 'New Table' : diff.action === 'modify' ? 'Modified' : 'No Changes'}
                                                        </Badge>
                                                    </div>

                                                    {/* Column Changes - GitHub Style */}
                                                    {diff.changes.length > 0 && (
                                                        <div className="font-mono text-sm divide-y divide-border/50">
                                                            {diff.changes.map((change, idx) => (
                                                                <div
                                                                    key={idx}
                                                                    className={`px-4 py-2 flex items-center gap-3 ${change.type === 'add'
                                                                            ? 'bg-green-500/5 text-green-600 dark:text-green-400'
                                                                            : change.type === 'remove'
                                                                                ? 'bg-red-500/5 text-red-600 dark:text-red-400'
                                                                                : 'bg-amber-500/5 text-amber-600 dark:text-amber-400'
                                                                        }`}
                                                                >
                                                                    <span className="w-5 shrink-0 flex items-center justify-center">
                                                                        {change.type === 'add' && <Plus className="h-4 w-4" />}
                                                                        {change.type === 'remove' && <Minus className="h-4 w-4" />}
                                                                        {change.type === 'modify' && <RefreshCw className="h-3 w-3" />}
                                                                    </span>
                                                                    <span className="font-medium">{change.column}</span>
                                                                    <span className="text-muted-foreground">
                                                                        {change.type === 'add' && change.sourceType}
                                                                        {change.type === 'remove' && change.targetType}
                                                                        {change.type === 'modify' && (
                                                                            <span className="flex items-center gap-1">
                                                                                <span className="text-red-500 line-through">{change.targetType}</span>
                                                                                <ArrowRight className="h-3 w-3" />
                                                                                <span className="text-green-500">{change.sourceType}</span>
                                                                            </span>
                                                                        )}
                                                                    </span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}

                                                    {diff.action === 'skip' && (
                                                        <div className="px-4 py-3 text-sm text-muted-foreground italic">
                                                            Schema is identical in both databases
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                )}

                                {/* Dry Run Results */}
                                {dryRunResults.length > 0 && (
                                    <div className="space-y-3 pt-4 border-t">
                                        <h3 className="text-sm font-medium flex items-center gap-2">
                                            <Eye className="h-4 w-4" />
                                            SQL Preview (Dry Run)
                                        </h3>
                                        {dryRunResults.map((result, idx) => (
                                            <div key={idx} className="border rounded-lg overflow-hidden bg-card">
                                                <div className="px-4 py-2 bg-muted/50 flex items-center gap-2 border-b">
                                                    <Table2 className="h-4 w-4" />
                                                    <span className="font-medium font-mono text-sm">{result.table}</span>
                                                    <span className="text-xs text-muted-foreground ml-auto">
                                                        {result.message}
                                                    </span>
                                                </div>
                                                {result.warnings && result.warnings.length > 0 && (
                                                    <div className="px-4 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 border-b">
                                                        {result.warnings.slice(0, 3).map((w, i) => (
                                                            <div key={i} className="flex items-start gap-2">
                                                                <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                                                                <span className="break-words">{w}</span>
                                                            </div>
                                                        ))}
                                                        {result.warnings.length > 3 && (
                                                            <div className="opacity-80">+{result.warnings.length - 3} more warning(s)</div>
                                                        )}
                                                    </div>
                                                )}
                                                <pre className="p-4 bg-zinc-950 text-zinc-100 text-xs overflow-x-auto">
                                                    <code>{result.sql}</code>
                                                </pre>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {/* Migration Results */}
                                {migrationResults.length > 0 && (
                                    <div className="space-y-3 pt-4 border-t">
                                        <h3 className="text-sm font-medium flex items-center gap-2">
                                            {migrationResults.every(r => r.success) ? (
                                                <CheckCircle2 className="h-4 w-4 text-green-500" />
                                            ) : (
                                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                            )}
                                            Migration Results
                                        </h3>
                                        {lastBackupPath && (
                                            <div className="space-y-2">
                                                <div className="text-xs text-muted-foreground">
                                                    Backup created: <span className="font-mono">{lastBackupPath}</span>
                                                </div>
                                                {targetConnection?.type === 'sqlite' && (
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        disabled={isRestoringBackup}
                                                        onClick={async () => {
                                                            if (!targetId) return
                                                            setIsRestoringBackup(true)
                                                            try {
                                                                const restoreFn = (window.api as any)?.restoreSqliteBackup
                                                                if (typeof restoreFn !== 'function') {
                                                                    setMigrationResults([
                                                                        {
                                                                            table: '(restore)',
                                                                            success: false,
                                                                            message:
                                                                                'Restore API is not available in the preload bridge. Fully restart the Electron app.'
                                                                        }
                                                                    ])
                                                                    return
                                                                }

                                                                const res = await restoreFn({
                                                                    connectionId: targetId,
                                                                    backupPath: lastBackupPath
                                                                })
                                                                if (!res.success) {
                                                                    setMigrationResults([
                                                                        {
                                                                            table: '(restore)',
                                                                            success: false,
                                                                            message: res.error || 'Failed to restore backup'
                                                                        }
                                                                    ])
                                                                } else {
                                                                    setMigrationResults([
                                                                        {
                                                                            table: '(restore)',
                                                                            success: true,
                                                                            message: 'Backup restored successfully'
                                                                        }
                                                                    ])
                                                                }
                                                            } finally {
                                                                setIsRestoringBackup(false)
                                                            }
                                                        }}
                                                    >
                                                        {isRestoringBackup ? (
                                                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                                        ) : (
                                                            <ArrowLeft className="h-4 w-4 mr-2" />
                                                        )}
                                                        Restore Backup (SQLite)
                                                    </Button>
                                                )}
                                            </div>
                                        )}
                                        <div className="space-y-2">
                                            {migrationResults.map((result, idx) => (
                                                <div
                                                    key={idx}
                                                    className={`flex items-center gap-3 p-3 rounded-md ${result.success
                                                            ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                                                            : 'bg-red-500/10 text-red-600 dark:text-red-400'
                                                        }`}
                                                >
                                                    {result.success ? (
                                                        <CheckCircle2 className="h-4 w-4 shrink-0" />
                                                    ) : (
                                                        <XCircle className="h-4 w-4 shrink-0" />
                                                    )}
                                                    <span className="font-medium font-mono">{result.table}</span>
                                                    <span className="text-sm opacity-80 ml-auto">{result.message}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </ScrollArea>
                    </div>

                    {/* Right Sidebar - Configuration Panel */}
                    <div className="w-80 border-l border-border flex flex-col bg-muted/30">
                        <ScrollArea className="flex-1">
                            <div className="p-4 space-y-6 min-w-0 overflow-hidden gap-2 flex flex-col">
                                {/* Source Database */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Database className="h-3.5 w-3.5 text-blue-500" />
                                        Source Database
                                    </h3>
                                    <div className="flex gap-2 min-w-0">
                                        <Select
                                            value={sourceId}
                                            onValueChange={(id) => {
                                                setSourceId(id)
                                                setSourceStatus('idle')
                                                setSourceSchemas([])
                                                setSelectedTables(new Set())
                                                setSchemaDiffs([])
                                            }}
                                        >
                                            <SelectTrigger className="flex-1 h-9 min-w-0 w-full overflow-hidden">
                                                    <div className="min-w-0 overflow-hidden flex-1 max-w-[180px]">
                                                        <SelectValue className="truncate block" placeholder="Select..." />
                                                    </div>
                                                </SelectTrigger>
                                            <SelectContent>
                                                    {sqlConnections.map(conn => {
                                                        return (
                                                            <SelectItem
                                                                key={conn.id}
                                                                value={conn.id}
                                                                disabled={conn.id === targetId}
                                                            >
                                                                <span className="min-w-0 flex items-center gap-2">
                                                                    <span className="truncate flex-1 min-w-0">{conn.name}</span>
                                                                    <Badge variant="outline" className="text-xs">
                                                                        {conn.type}
                                                                    </Badge>
                                                                </span>
                                                            </SelectItem>
                                                        )
                                                    })}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => testConnection('source')}
                                            disabled={!sourceId || sourceStatus === 'testing'}
                                            className="h-9 px-3"
                                        >
                                            {sourceStatus === 'testing' ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Plug className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                    {sourceStatus === 'connected' && (
                                        <div className="flex items-center gap-2 text-xs text-green-500">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            <span>{sourceSchemas.length} tables</span>
                                        </div>
                                    )}
                                    {sourceStatus === 'error' && sourceError && (
                                        <div className="text-xs text-destructive">{sourceError}</div>
                                    )}
                                </div>

                                {/* Arrow Indicator */}
                                <div className="flex justify-center">
                                    <div className="p-2 rounded-full bg-muted">
                                        <ArrowRight className="h-4 w-4 text-muted-foreground rotate-90" />
                                    </div>
                                </div>

                                {/* Target Database */}
                                <div className="space-y-3">
                                    <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                                        <Database className="h-3.5 w-3.5 text-green-500" />
                                        Target Database
                                    </h3>
                                    <div className="flex gap-2 min-w-0">
                                        <Select
                                            value={targetId}
                                            onValueChange={(id) => {
                                                setTargetId(id)
                                                setTargetStatus('idle')
                                                setTargetSchemas([])
                                                setSchemaDiffs([])
                                            }}
                                        >
                                            <SelectTrigger className="flex-1 h-9 min-w-0 w-full overflow-hidden">
                                                    <div className="min-w-0 overflow-hidden flex-1 max-w-[180px]">
                                                        <SelectValue className="truncate block" placeholder="Select..." />
                                                    </div>
                                                </SelectTrigger>
                                            <SelectContent>
                                                    {sqlConnections.map(conn => (
                                                        <SelectItem
                                                            key={conn.id}
                                                            value={conn.id}
                                                            disabled={conn.id === sourceId}
                                                        >
                                                            <span className="min-w-0 flex items-center gap-2">
                                                                <span className="truncate flex-1 min-w-0">{conn.name}</span>
                                                                <Badge variant="outline" className="text-xs">
                                                                    {conn.type}
                                                                </Badge>
                                                            </span>
                                                        </SelectItem>
                                                    ))}
                                            </SelectContent>
                                        </Select>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => testConnection('target')}
                                            disabled={!targetId || targetStatus === 'testing'}
                                            className="h-9 px-3"
                                        >
                                            {targetStatus === 'testing' ? (
                                                <Loader2 className="h-4 w-4 animate-spin" />
                                            ) : (
                                                <Plug className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </div>
                                    {targetStatus === 'connected' && (
                                        <div className="flex items-center gap-2 text-xs text-green-500">
                                            <CheckCircle2 className="h-3.5 w-3.5" />
                                            <span>{targetSchemas.length} tables</span>
                                        </div>
                                    )}
                                    {targetStatus === 'error' && targetError && (
                                        <div className="text-xs text-destructive">{targetError}</div>
                                    )}
                                </div>

                                {/* Cross-Database Warning */}
                                {sourceConnection && targetConnection && sourceConnection.type !== targetConnection.type && (
                                    <div className="flex items-start gap-2 text-xs text-amber-500 bg-amber-500/10 p-3 rounded-md">
                                        <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                                        <span>
                                            Cross-database migration ({sourceConnection.type} → {targetConnection.type}).
                                            Types will be converted.
                                        </span>
                                    </div>
                                )}

                                <Separator />

                                {/* Backup option */}
                                {targetConnection && (
                                    <div className="space-y-2">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Safety
                                        </h3>
                                        <div
                                            className={`flex items-start gap-2 p-3 rounded-md border bg-background ${
                                                targetConnection.type === 'postgres' && pgDumpAvailable === false
                                                    ? 'opacity-60 cursor-not-allowed'
                                                    : 'cursor-pointer'
                                            }`}
                                            onClick={() => {
                                                if (targetConnection.type === 'postgres' && pgDumpAvailable === false) return
                                                setCreateBackup(v => !v)
                                            }}
                                        >
                                            <Checkbox
                                                checked={createBackup}
                                                onCheckedChange={() => {
                                                    if (targetConnection.type === 'postgres' && pgDumpAvailable === false) return
                                                    setCreateBackup(v => !v)
                                                }}
                                                className="h-4 w-4 mt-0.5"
                                            />
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">Create backup before applying</div>
                                                <div className="text-xs text-muted-foreground">
                                                    {targetConnection.type === 'sqlite'
                                                        ? 'Creates a copy of the SQLite database file.'
                                                        : pgDumpAvailable === false
                                                            ? 'pg_dump was not found on PATH; backups are disabled.'
                                                            : 'Creates a SQL dump using pg_dump (must be installed and on PATH).'}
                                                </div>
                                            </div>
                                        </div>
                                        <div
                                            className={`flex items-start gap-2 p-3 rounded-md border ${fullySync
                                                ? 'bg-destructive/10 border-destructive/50 cursor-pointer'
                                                : 'bg-background cursor-pointer'
                                            }`}
                                            onClick={() => handleFullySyncToggle()}
                                        >
                                            <Checkbox
                                                checked={fullySync}
                                                onCheckedChange={(value) => handleFullySyncToggle(Boolean(value))}
                                                onClick={(event) => event.stopPropagation()}
                                                className="h-4 w-4 mt-0.5"
                                            />
                                            <div className="min-w-0">
                                                <div className="text-sm font-medium">Fully sync schema</div>
                                                <div className="text-xs text-muted-foreground">
                                                    Drop tables on the target that are missing from the source schema. Use with caution.
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Table Selection */}
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                            Tables ({selectedTables.size}/{sourceSchemas.length})
                                        </h3>
                                        {sourceSchemas.length > 0 && (
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleSelectAll}
                                                className="h-6 text-xs px-2"
                                            >
                                                {selectedTables.size === sourceSchemas.length ? 'Clear' : 'All'}
                                            </Button>
                                        )}
                                    </div>

                                    {sourceSchemas.length === 0 ? (
                                        <div className="text-xs text-muted-foreground py-4 text-center">
                                            Connect to source database to see tables
                                        </div>
                                    ) : (
                                        <div className="space-y-1 max-h-48 overflow-y-auto">
                                            {sourceSchemas.map(schema => (
                                                <div
                                                    key={schema.name}
                                                    className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors text-sm ${selectedTables.has(schema.name)
                                                            ? 'bg-primary/10 text-primary'
                                                            : 'hover:bg-muted'
                                                        }`}
                                                    onClick={() => handleTableToggle(schema.name)}
                                                >
                                                    <Checkbox
                                                        checked={selectedTables.has(schema.name)}
                                                        onCheckedChange={() => handleTableToggle(schema.name)}
                                                        className="h-3.5 w-3.5"
                                                    />
                                                    <Table2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                                    <span className="truncate font-mono text-xs">{schema.name}</span>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </ScrollArea>

                        {/* Action Buttons - Fixed at Bottom */}
                        <div className="p-4 border-t bg-background space-y-2 gap-2 flex flex-col">
                            <Button
                                onClick={generateDiffs}
                                disabled={!canGenerateDiff || isLoadingDiff}
                                className="w-full"
                                variant="outline"
                            >
                                {isLoadingDiff ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <RefreshCw className="h-4 w-4 mr-2" />
                                )}
                                Generate Diff
                            </Button>
                            <Button
                                variant="outline"
                                onClick={handleDryRun}
                                disabled={!canDryRun || isDryRun}
                                className="w-full"
                            >
                                {isDryRun ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Eye className="h-4 w-4 mr-2" />
                                )}
                                Dry Run
                            </Button>
                            <Button
                                onClick={() => setShowConfirmDialog(true)}
                                disabled={!canMigrate || isMigrating}
                                className="w-full bg-green-600 hover:bg-green-700"
                            >
                                {isMigrating ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Play className="h-4 w-4 mr-2" />
                                )}
                                Execute Migration
                            </Button>
                        </div>
                    </div>
                </div>
            </SidebarInset>

            {/* Confirmation Dialog */}
            <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Confirm Schema Migration
                        </DialogTitle>
                        <DialogDescription className="space-y-3 pt-2">
                            <p>
                                You are about to execute a schema migration on <strong>{targetConnection?.name}</strong>.
                                This action will modify the database structure and <strong>cannot be undone</strong>.
                            </p>
                            <p className="text-sm font-medium text-foreground">
                                To confirm, type "<code className="bg-muted px-1.5 py-0.5 rounded text-xs">{CONFIRM_PHRASE}</code>" below:
                            </p>
                        </DialogDescription>
                    </DialogHeader>

                    <Input
                        placeholder="Type confirmation phrase..."
                        value={confirmText}
                        onChange={(e) => setConfirmText(e.target.value.toLowerCase())}
                        className="font-mono"
                    />

                    <DialogFooter>
                        <Button variant="outline" onClick={() => {
                            setShowConfirmDialog(false)
                            setConfirmText('')
                        }}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleMigrate}
                            disabled={confirmText !== CONFIRM_PHRASE}
                        >
                            Execute Migration
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}

