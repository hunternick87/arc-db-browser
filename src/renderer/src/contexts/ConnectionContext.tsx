import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react'
import type { DatabaseConnection, TableInfo, KeyInfo } from '@/lib/types'

interface ConnectionState {
    connection: DatabaseConnection
    isConnected: boolean
    tables?: TableInfo[]
    keys?: KeyInfo[]
    metadata?: Record<string, unknown>
}

interface ConnectionContextType {
    connections: DatabaseConnection[]
    activeConnection: ConnectionState | null
    addConnection: (connection: DatabaseConnection) => Promise<void>
    removeConnection: (id: string) => Promise<void>
    connect: (id: string) => Promise<void>
    disconnect: () => Promise<void>
    refreshTables: () => Promise<void>
    refreshKeys: (pattern?: string) => Promise<void>
    refreshConnections: () => Promise<void>
    isLoading: boolean
    error: string | null
}

const ConnectionContext = createContext<ConnectionContextType | null>(null)

export function ConnectionProvider({ children }: { children: ReactNode }): React.JSX.Element {
    const [connections, setConnections] = useState<DatabaseConnection[]>([])
    const [activeConnection, setActiveConnection] = useState<ConnectionState | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // Load saved connections on mount
    useEffect(() => {
        const loadConnections = async () => {
            try {
                const result = await window.api.getSavedConnections()
                if (result.success && result.connections) {
                    setConnections(result.connections as DatabaseConnection[])
                }
            } catch (err) {
                console.error('Failed to load saved connections:', err)
            }
        }
        loadConnections()
    }, [])

    const refreshConnections = useCallback(async () => {
        try {
            const result = await window.api.getSavedConnections()
            if (result.success && result.connections) {
                setConnections(result.connections as DatabaseConnection[])
            }
        } catch (err) {
            console.error('Failed to refresh connections:', err)
        }
    }, [])

    const addConnection = useCallback(async (connection: DatabaseConnection) => {
        setConnections(prev => [...prev, connection])
        // Save to persistent storage
        try {
            await window.api.saveStoredConnection(connection)
        } catch (err) {
            console.error('Failed to save connection:', err)
        }
    }, [])

    const removeConnection = useCallback(async (id: string) => {
        setConnections(prev => prev.filter(c => c.id !== id))
        if (activeConnection?.connection.id === id) {
            setActiveConnection(null)
        }
        // Remove from persistent storage
        try {
            await window.api.deleteStoredConnection(id)
        } catch (err) {
            console.error('Failed to delete stored connection:', err)
        }
    }, [activeConnection])

    const connect = useCallback(async (id: string) => {
        const connection = connections.find(c => c.id === id)
        if (!connection) return

        setIsLoading(true)
        setError(null)

        try {
            const result = await window.api.connect(connection)
            if (!result.success) {
                throw new Error(result.error || 'Connection failed')
            }

            const newState: ConnectionState = {
                connection,
                isConnected: true
            }

            // Load tables or keys based on connection type
            if (connection.type === 'sqlite' || connection.type === 'postgres') {
                const tablesResult = await window.api.getTables(connection.id)
                if (tablesResult.success) {
                    newState.tables = tablesResult.tables
                }
            } else if (connection.type === 'valkey') {
                const keysResult = await window.api.scanKeys(connection.id, '*', 100)
                if (keysResult.success) {
                    newState.keys = keysResult.keys
                }
            }

            setActiveConnection(newState)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }, [connections])

    const disconnect = useCallback(async () => {
        if (!activeConnection) return

        setIsLoading(true)
        try {
            await window.api.disconnect(activeConnection.connection.id)
            setActiveConnection(null)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }, [activeConnection])

    const refreshTables = useCallback(async () => {
        if (!activeConnection || (activeConnection.connection.type !== 'sqlite' && activeConnection.connection.type !== 'postgres')) return

        setIsLoading(true)
        try {
            const result = await window.api.getTables(activeConnection.connection.id)
            if (result.success) {
                setActiveConnection(prev => prev ? { ...prev, tables: result.tables } : null)
            }
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }, [activeConnection])

    const refreshKeys = useCallback(async (pattern = '*') => {
        if (!activeConnection || activeConnection.connection.type !== 'valkey') return

        setIsLoading(true)
        try {
            const result = await window.api.scanKeys(activeConnection.connection.id, pattern, 100)
            if (result.success) {
                setActiveConnection(prev => prev ? { ...prev, keys: result.keys } : null)
            }
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }, [activeConnection])

    return (
        <ConnectionContext.Provider
            value={{
                connections,
                activeConnection,
                addConnection,
                removeConnection,
                connect,
                disconnect,
                refreshTables,
                refreshKeys,
                refreshConnections,
                isLoading,
                error
            }}
        >
            {children}
        </ConnectionContext.Provider>
    )
}

export function useConnection(): ConnectionContextType {
    const context = useContext(ConnectionContext)
    if (!context) {
        throw new Error('useConnection must be used within a ConnectionProvider')
    }
    return context
}
