import { useState } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { TopBar } from '@/components/layout/TopBar'
import { SchemaMigrationPage } from '@/components/schema/SchemaMigrationPage'
import { ToolRail, type ToolkitMode } from '@/components/layout/ToolRail'
import { ToolkitWorkbench } from '@/components/layout/ToolkitWorkbench'
import { DatabaseWorkbench } from '@/components/layout/DatabaseWorkbench'
import { GitHubWorkbench } from '@/components/github/GitHubWorkbench'
import { ConnectionProvider } from '@/contexts/ConnectionContext'
import type { TableInfo, KeyInfo } from '@/lib/types'

const TOOLBAR_TITLES: Record<ToolkitMode, string> = {
    database: 'Arc Dev Toolkit - Database',
    github: 'Arc Dev Toolkit - GitHub',
    migration: 'Arc Dev Toolkit - Schema Migration',
    json: 'Arc Dev Toolkit - JSON Lab',
    api: 'Arc Dev Toolkit - API Console',
    terminal: 'Arc Dev Toolkit - Task Runner'
}

export default function MainLayout(): React.JSX.Element {
    const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
    const [selectedKey, setSelectedKey] = useState<KeyInfo | null>(null)
    const [activeMode, setActiveMode] = useState<ToolkitMode>('database')

    const handleTableSelect = (table: TableInfo) => {
        setSelectedTable(table)
        setSelectedKey(null)
    }

    const handleKeySelect = (key: KeyInfo) => {
        setSelectedKey(key)
        setSelectedTable(null)
    }

    return (
        <ConnectionProvider>
            <SidebarProvider style={{ '--sidebar-width': '16rem' } as React.CSSProperties}>
                <div className="flex h-screen w-screen flex-col overflow-hidden bg-background">
                    <TopBar title={TOOLBAR_TITLES[activeMode]} />
                    <div className="flex min-h-0 flex-1 overflow-hidden">
                        <ToolRail activeMode={activeMode} onModeChange={setActiveMode} />

                        {activeMode === 'database' && (
                            <DatabaseWorkbench
                                selectedTable={selectedTable}
                                selectedKey={selectedKey}
                                onTableSelect={handleTableSelect}
                                onKeySelect={handleKeySelect}
                            />
                        )}

                        {activeMode === 'github' && <GitHubWorkbench />}

                        {activeMode === 'migration' && <SchemaMigrationPage />}

                        {(activeMode === 'json' || activeMode === 'api' || activeMode === 'terminal') && (
                            <ToolkitWorkbench mode={activeMode} />
                        )}
                    </div>
                </div>
            </SidebarProvider>
        </ConnectionProvider>
    )
}
