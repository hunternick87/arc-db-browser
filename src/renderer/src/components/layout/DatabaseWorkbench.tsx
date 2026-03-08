import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
    Database,
    Table2,
    Key,
    Plus,
    Unplug,
    RefreshCw,
    FileJson2,
    Settings,
    ArrowUpCircle
} from 'lucide-react'
import { useConnection } from '@/contexts/ConnectionContext'
import { ConnectionDialog } from '@/components/connections/ConnectionDialog'
import { ConnectionManagerDialog } from '@/components/connections/ConnectionManagerDialog'
import { UpdaterDialog } from '@/components/updates/UpdaterDialog'
import { ContentArea } from '@/components/layout/ContentArea'
import type { TableInfo, KeyInfo } from '@/lib/types'

interface DatabaseWorkbenchProps {
    selectedTable: TableInfo | null
    selectedKey: KeyInfo | null
    onTableSelect: (table: TableInfo) => void
    onKeySelect: (key: KeyInfo) => void
}

export function DatabaseWorkbench({
    selectedTable,
    selectedKey,
    onTableSelect,
    onKeySelect
}: DatabaseWorkbenchProps): React.JSX.Element {
    const [dialogOpen, setDialogOpen] = useState(false)
    const [managerDialogOpen, setManagerDialogOpen] = useState(false)
    const [updatesDialogOpen, setUpdatesDialogOpen] = useState(false)

    const {
        connections,
        activeConnection,
        connect,
        disconnect,
        refreshTables,
        refreshKeys,
        isLoading
    } = useConnection()

    const handleRefresh = () => {
        if (activeConnection?.connection.type === 'valkey') {
            refreshKeys()
        } else {
            refreshTables()
        }
    }

    return (
        <>
            <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/20">
                <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden bg-background shadow-sm">
                    <div className="flex min-h-0 h-full w-[300px] shrink-0 flex-col border-r bg-background">
                        <div className="flex min-h-0 flex-1 flex-col">
                            <div className="flex items-center justify-between px-3 pb-2 pt-3 text-xs font-medium text-muted-foreground">
                                <span>Connections</span>
                                <div className="flex items-center gap-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setManagerDialogOpen(true)}
                                        title="Manage connections"
                                    >
                                        <Settings className="h-3.5 w-3.5" />
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={() => setDialogOpen(true)}
                                        title="Add connection"
                                    >
                                        <Plus className="h-4 w-4" />
                                    </Button>
                                </div>
                            </div>

                            <ScrollArea className="max-h-52 px-2">
                                <div className="space-y-1 pb-2">
                                    {connections.map(conn => {
                                        // @ts-ignore - using metadata to track hidden state without changing shared type shape
                                        if (conn.metadata?.hidden) return null

                                        return (
                                            <button
                                                key={conn.id}
                                                type="button"
                                                onClick={() => connect(conn.id)}
                                                disabled={isLoading}
                                                className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition-colors ${
                                                    activeConnection?.connection.id === conn.id
                                                        ? 'bg-muted'
                                                        : 'hover:bg-muted/70'
                                                }`}
                                            >
                                                <Database className="h-4 w-4 shrink-0" />
                                                <span className="flex-1 truncate">{conn.name}</span>
                                                <Badge variant="outline" className="text-[10px] uppercase">
                                                    {conn.type}
                                                </Badge>
                                            </button>
                                        )
                                    })}

                                    {connections.length === 0 && (
                                        <div className="px-2 py-3 text-xs text-muted-foreground">
                                            No connections yet
                                        </div>
                                    )}
                                </div>
                            </ScrollArea>

                            {activeConnection && (
                                <>
                                    <Separator />
                                    <div className="flex items-center justify-between px-3 pb-2 pt-3 text-xs font-medium text-muted-foreground">
                                        <span>{activeConnection.connection.type === 'valkey' ? 'Keys' : 'Tables'}</span>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            className="h-6 w-6"
                                            onClick={handleRefresh}
                                            disabled={isLoading}
                                        >
                                            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                                        </Button>
                                    </div>
                                    <ScrollArea className="min-h-0 flex-1 px-2 pb-2">
                                        <div className="space-y-1">
                                            {activeConnection.tables?.map(table => (
                                                <button
                                                    key={table.name}
                                                    type="button"
                                                    onClick={() => onTableSelect(table)}
                                                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/70"
                                                >
                                                    {table.type === 'view' ? (
                                                        <FileJson2 className="h-4 w-4 shrink-0" />
                                                    ) : (
                                                        <Table2 className="h-4 w-4 shrink-0" />
                                                    )}
                                                    <span className="truncate">{table.name}</span>
                                                </button>
                                            ))}

                                            {activeConnection.keys?.map(keyInfo => (
                                                <button
                                                    key={keyInfo.key}
                                                    type="button"
                                                    onClick={() => onKeySelect(keyInfo)}
                                                    className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/70"
                                                >
                                                    <Key className="h-4 w-4 shrink-0" />
                                                    <span className="flex-1 truncate">{keyInfo.key}</span>
                                                    <Badge variant="secondary" className="text-[10px] uppercase">
                                                        {keyInfo.type}
                                                    </Badge>
                                                </button>
                                            ))}

                                            {!activeConnection.tables?.length && !activeConnection.keys?.length && (
                                                <div className="px-2 py-3 text-xs text-muted-foreground">
                                                    No items found
                                                </div>
                                            )}
                                        </div>
                                    </ScrollArea>
                                </>
                            )}
                        </div>

                        <div className="space-y-2 border-t border-border p-3">
                            {!activeConnection && (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => setUpdatesDialogOpen(true)}
                                >
                                    <ArrowUpCircle className="mr-2 h-4 w-4" />
                                    Updates
                                </Button>
                            )}
                            {activeConnection && (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={disconnect}
                                    disabled={isLoading}
                                >
                                    <Unplug className="mr-2 h-4 w-4" />
                                    Disconnect
                                </Button>
                            )}
                        </div>
                    </div>

                    <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
                        <ContentArea
                            selectedTable={selectedTable}
                            selectedKey={selectedKey}
                            onTableSelect={onTableSelect}
                            onKeySelect={onKeySelect}
                            showHeader={false}
                        />
                    </div>
                </div>
            </div>

            <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            <ConnectionManagerDialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen} />
            <UpdaterDialog open={updatesDialogOpen} onOpenChange={setUpdatesDialogOpen} />
        </>
    )
}
