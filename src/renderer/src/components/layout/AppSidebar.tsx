import { useState } from 'react'
import {
    Sidebar,
    SidebarContent,
    SidebarGroup,
    SidebarGroupContent,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarFooter
} from '@/components/ui/sidebar'
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
    ArrowLeftRight,
    Settings,
    ArrowUpCircle
} from 'lucide-react'
import { useConnection } from '@/contexts/ConnectionContext'
import { ConnectionDialog } from '@/components/connections/ConnectionDialog'
import { ConnectionManagerDialog } from '@/components/connections/ConnectionManagerDialog'
import { UpdaterDialog } from '@/components/updates/UpdaterDialog'
import type { TableInfo, KeyInfo } from '@/lib/types'

interface AppSidebarProps {
    onTableSelect?: (table: TableInfo) => void
    onKeySelect?: (key: KeyInfo) => void
    onOpenMigration?: () => void
}

export function AppSidebar({ onTableSelect, onKeySelect, onOpenMigration }: AppSidebarProps): React.JSX.Element {
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
            <Sidebar className="border-r border-border">
                <SidebarHeader className="p-4">
                    <div className="flex items-center gap-2">
                        <Database className="h-6 w-6 text-primary" />
                        <span className="font-semibold text-lg">Arc DB Browser</span>
                    </div>
                </SidebarHeader>

                <SidebarContent>
                    {/* Connections Section */}
                    <SidebarGroup>
                        <SidebarGroupLabel className="flex items-center justify-between">
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
                        </SidebarGroupLabel>
                        <SidebarGroupContent>
                            <SidebarMenu>
                                {connections.map(conn => {
                                    // @ts-ignore - using metadata to track hidden state without modifying the original connection type
                                    if (conn.metadata?.hidden) return null
                                    return (
                                        <SidebarMenuItem key={conn.id}>
                                            <SidebarMenuButton
                                                onClick={() => connect(conn.id)}
                                                isActive={activeConnection?.connection.id === conn.id}
                                                disabled={isLoading}
                                            >
                                                <Database className="h-4 w-4" />
                                                <span className="flex-1 truncate">{conn.name}</span>
                                                <Badge variant="outline" className="text-xs">
                                                    {conn.type}
                                                </Badge>
                                            </SidebarMenuButton>
                                        </SidebarMenuItem>
                                    )
                                })}
                                {connections.length === 0 && (
                                    <div className="px-3 py-2 text-sm text-muted-foreground">
                                        No connections yet
                                    </div>
                                )}
                            </SidebarMenu>
                        </SidebarGroupContent>
                    </SidebarGroup>

                    {/* Active Connection Browser */}
                    {activeConnection && (
                        <>
                            <Separator className="my-2" />
                            <SidebarGroup>
                                <SidebarGroupLabel className="flex items-center justify-between">
                                    <span>
                                        {activeConnection.connection.type === 'valkey' ? 'Keys' : 'Tables'}
                                    </span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6"
                                        onClick={handleRefresh}
                                        disabled={isLoading}
                                    >
                                        <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
                                    </Button>
                                </SidebarGroupLabel>
                                <SidebarGroupContent>
                                    <ScrollArea className="h-[calc(100vh-350px)]">
                                        <SidebarMenu>
                                            {/* Tables for SQL databases */}
                                            {activeConnection.tables?.map(table => (
                                                <SidebarMenuItem key={table.name}>
                                                    <SidebarMenuButton onClick={() => onTableSelect?.(table)}>
                                                        {table.type === 'view' ? (
                                                            <FileJson2 className="h-4 w-4" />
                                                        ) : (
                                                            <Table2 className="h-4 w-4" />
                                                        )}
                                                        <span className="truncate">{table.name}</span>
                                                    </SidebarMenuButton>
                                                </SidebarMenuItem>
                                            ))}

                                            {/* Keys for Valkey */}
                                            {activeConnection.keys?.map(keyInfo => (
                                                <SidebarMenuItem key={keyInfo.key}>
                                                    <SidebarMenuButton onClick={() => onKeySelect?.(keyInfo)}>
                                                        <Key className="h-4 w-4" />
                                                        <span className="truncate flex-1">{keyInfo.key}</span>
                                                        <Badge variant="secondary" className="text-xs">
                                                            {keyInfo.type}
                                                        </Badge>
                                                    </SidebarMenuButton>
                                                </SidebarMenuItem>
                                            ))}

                                            {!activeConnection.tables?.length && !activeConnection.keys?.length && (
                                                <div className="px-3 py-2 text-sm text-muted-foreground">
                                                    No items found
                                                </div>
                                            )}
                                        </SidebarMenu>
                                    </ScrollArea>
                                </SidebarGroupContent>
                            </SidebarGroup>
                        </>
                    )}
                </SidebarContent>

                <SidebarFooter className="p-4 space-y-2">
                    <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => setUpdatesDialogOpen(true)}
                    >
                        <ArrowUpCircle className="h-4 w-4 mr-2" />
                        Updates
                    </Button>
                    {/* Schema Migration - Always visible when there are SQL connections */}
                    {connections.some(c => c.type === 'sqlite' || c.type === 'postgres') && (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={onOpenMigration}
                        >
                            <ArrowLeftRight className="h-4 w-4 mr-2" />
                            Schema Migration
                        </Button>
                    )}
                    {activeConnection && (
                        <Button
                            variant="outline"
                            className="w-full"
                            onClick={disconnect}
                            disabled={isLoading}
                        >
                            <Unplug className="h-4 w-4 mr-2" />
                            Disconnect
                        </Button>
                    )}
                </SidebarFooter>
            </Sidebar>

            <ConnectionDialog open={dialogOpen} onOpenChange={setDialogOpen} />
            <ConnectionManagerDialog open={managerDialogOpen} onOpenChange={setManagerDialogOpen} />
            <UpdaterDialog open={updatesDialogOpen} onOpenChange={setUpdatesDialogOpen} />
        </>
    )
}
