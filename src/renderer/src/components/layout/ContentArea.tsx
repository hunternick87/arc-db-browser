import { SidebarInset, SidebarTrigger } from '@/components/ui/sidebar'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useConnection } from '@/contexts/ConnectionContext'
import { DataTableView } from '@/components/data-table/DataTableView'
import { KeyValueView } from '@/components/explorer/KeyValueView'
import { QueryEditor } from '@/components/query/QueryEditor'
import { Database, Terminal } from 'lucide-react'
import type { TableInfo, KeyInfo } from '@/lib/types'
import { useState, useEffect } from 'react'

interface ContentAreaProps {
    selectedTable: TableInfo | null
    selectedKey: KeyInfo | null
    onTableSelect: (table: TableInfo) => void
    onKeySelect: (key: KeyInfo) => void
}

export function ContentArea({
    selectedTable,
    selectedKey,
    onTableSelect
}: ContentAreaProps): React.JSX.Element {
    const { activeConnection } = useConnection()
    const [activeTab, setActiveTab] = useState('data')

    // Switch to data tab when table or key is selected
    useEffect(() => {
        if (selectedTable || selectedKey) {
            setActiveTab('data')
        }
    }, [selectedTable, selectedKey])

    return (
        <SidebarInset className="flex flex-col flex-1 overflow-hidden min-w-0">
            {/* Header */}
            <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
                <SidebarTrigger className="-ml-1" />
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center gap-2 flex-1">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">
                        {activeConnection
                            ? activeConnection.connection.name
                            : 'No connection selected'}
                    </span>
                </div>
            </header>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden min-w-0">
                {!activeConnection ? (
                    <div className="flex items-center justify-center h-full">
                        <div className="text-center space-y-2 flex flex-col items-center">
                            <Database className="h-12 w-12 mx-auto text-muted-foreground/50" />
                            <h2 className="text-lg font-medium text-muted-foreground">
                                No Connection Selected
                            </h2>
                            <p className="text-sm text-muted-foreground">
                                Select a connection from the sidebar or create a new one
                            </p>
                        </div>
                    </div>
                ) : (
                    <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col w-full">
                        <div className="border-b border-border px-4 w-full">
                            <TabsList className="bg-transparent h-10">
                                <TabsTrigger value="data" className="data-[state=active]:bg-muted">
                                    <Database className="h-4 w-4 mr-2" />
                                    Data
                                </TabsTrigger>
                                {(activeConnection.connection.type === 'sqlite' ||
                                    activeConnection.connection.type === 'postgres') && (
                                        <TabsTrigger value="query" className="data-[state=active]:bg-muted">
                                            <Terminal className="h-4 w-4 mr-2" />
                                            Query
                                        </TabsTrigger>
                                    )}
                            </TabsList>
                        </div>

                        <TabsContent value="data" className="flex-1 m-0 overflow-hidden w-full">
                            {activeConnection.connection.type === 'valkey' ? (
                                <KeyValueView selectedKey={selectedKey} />
                            ) : (
                                <DataTableView
                                    selectedTable={selectedTable}
                                    onTableSelect={onTableSelect}
                                />
                            )}
                        </TabsContent>

                        {(activeConnection.connection.type === 'sqlite' ||
                            activeConnection.connection.type === 'postgres') && (
                                <TabsContent value="query" className="flex-1 m-0 overflow-hidden">
                                    <QueryEditor />
                                </TabsContent>
                            )}
                    </Tabs>
                )}
            </div>
        </SidebarInset>
    )
}
