import { useState } from 'react'
import { SidebarProvider } from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/layout/AppSidebar'
import { ContentArea } from '@/components/layout/ContentArea'
import { SchemaMigrationPage } from '@/components/schema/SchemaMigrationPage'
import { ConnectionProvider } from '@/contexts/ConnectionContext'
import type { TableInfo, KeyInfo } from '@/lib/types'

type ActiveView = 'main' | 'schema-migration'

export default function MainLayout(): React.JSX.Element {
    const [selectedTable, setSelectedTable] = useState<TableInfo | null>(null)
    const [selectedKey, setSelectedKey] = useState<KeyInfo | null>(null)
    const [activeView, setActiveView] = useState<ActiveView>('main')

    const handleTableSelect = (table: TableInfo) => {
        setSelectedTable(table)
        setSelectedKey(null)
    }

    const handleKeySelect = (key: KeyInfo) => {
        setSelectedKey(key)
        setSelectedTable(null)
    }

    const handleOpenMigration = () => {
        setActiveView('schema-migration')
    }

    const handleCloseMigration = () => {
        setActiveView('main')
    }

    return (
        <ConnectionProvider>
            <SidebarProvider>
                <div className="flex h-screen w-screen overflow-hidden bg-background">
                    <AppSidebar
                        onTableSelect={handleTableSelect}
                        onKeySelect={handleKeySelect}
                        onOpenMigration={handleOpenMigration}
                    />
                    {activeView === 'main' ? (
                        <ContentArea
                            selectedTable={selectedTable}
                            selectedKey={selectedKey}
                            onTableSelect={handleTableSelect}
                            onKeySelect={handleKeySelect}
                        />
                    ) : (
                        <SchemaMigrationPage onBack={handleCloseMigration} />
                    )}
                </div>
            </SidebarProvider>
        </ConnectionProvider>
    )
}
