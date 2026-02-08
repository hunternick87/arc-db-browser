import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnection } from '@/contexts/ConnectionContext'
import type { KeyInfo } from '@/lib/types'
import { Search, RefreshCw, Key, Clock } from 'lucide-react'

interface KeyValueViewProps {
    selectedKey: KeyInfo | null
}

export function KeyValueView({ selectedKey }: KeyValueViewProps): React.JSX.Element {
    const { activeConnection, refreshKeys } = useConnection()
    const [keyValue, setKeyValue] = useState<unknown>(null)
    const [keyType, setKeyType] = useState<string>('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [searchPattern, setSearchPattern] = useState('*')

    // Load key value when selected
    useEffect(() => {
        if (!selectedKey || !activeConnection) {
            setKeyValue(null)
            setKeyType('')
            return
        }

        const loadKeyValue = async () => {
            setIsLoading(true)
            setError(null)

            try {
                const result = await window.api.getKeyValue(
                    activeConnection.connection.id,
                    selectedKey.key
                )

                if (!result.success) {
                    throw new Error(result.error)
                }

                setKeyValue(result.value)
                setKeyType(result.type || selectedKey.type)
            } catch (err) {
                setError((err as Error).message)
            } finally {
                setIsLoading(false)
            }
        }

        loadKeyValue()
    }, [selectedKey, activeConnection])

    const handleSearch = () => {
        refreshKeys(searchPattern)
    }

    const renderValue = () => {
        if (isLoading) {
            return <Skeleton className="h-32 w-full" />
        }

        if (error) {
            return <div className="text-destructive">{error}</div>
        }

        if (keyValue === null || keyValue === undefined) {
            return <div className="text-muted-foreground italic">Key not found or has no value</div>
        }

        switch (keyType) {
            case 'string':
                return (
                    <pre className="bg-muted p-4 rounded-md overflow-auto text-sm">
                        {String(keyValue)}
                    </pre>
                )

            case 'hash':
                return (
                    <div className="space-y-2">
                        {Object.entries(keyValue as Record<string, string>).map(([field, value]) => (
                            <div key={field} className="flex gap-2 p-2 bg-muted rounded-md">
                                <span className="font-mono font-medium text-primary">{field}:</span>
                                <span className="font-mono flex-1 truncate">{value}</span>
                            </div>
                        ))}
                    </div>
                )

            case 'list':
                return (
                    <div className="space-y-1">
                        {(keyValue as string[]).map((item, index) => (
                            <div key={index} className="flex gap-2 p-2 bg-muted rounded-md">
                                <span className="text-muted-foreground text-sm w-8">{index}</span>
                                <span className="font-mono flex-1">{item}</span>
                            </div>
                        ))}
                    </div>
                )

            case 'set':
                return (
                    <div className="flex flex-wrap gap-2">
                        {(keyValue as string[]).map((member, index) => (
                            <Badge key={index} variant="secondary" className="font-mono">
                                {member}
                            </Badge>
                        ))}
                    </div>
                )

            case 'zset':
                return (
                    <div className="space-y-1">
                        {(keyValue as { member: string; score: string }[]).map((item, index) => (
                            <div key={index} className="flex gap-2 p-2 bg-muted rounded-md items-center">
                                <Badge variant="outline" className="font-mono">
                                    {item.score}
                                </Badge>
                                <span className="font-mono flex-1">{item.member}</span>
                            </div>
                        ))}
                    </div>
                )

            default:
                return (
                    <pre className="bg-muted p-4 rounded-md overflow-auto text-sm">
                        {JSON.stringify(keyValue, null, 2)}
                    </pre>
                )
        }
    }

    return (
        <div className="flex flex-col h-full p-4 gap-4">
            {/* Search bar */}
            <div className="flex gap-2">
                <div className="relative flex-1">
                    <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                        placeholder="Search pattern (e.g., user:*)"
                        value={searchPattern}
                        onChange={(e) => setSearchPattern(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                        className="pl-8"
                    />
                </div>
                <Button variant="outline" onClick={handleSearch}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Scan
                </Button>
            </div>

            {/* Key value display */}
            {selectedKey ? (
                <Card className="flex-1 flex flex-col overflow-hidden">
                    <CardHeader className="pb-3">
                        <div className="flex items-center justify-between">
                            <CardTitle className="flex items-center gap-2 text-lg">
                                <Key className="h-4 w-4" />
                                {selectedKey.key}
                            </CardTitle>
                            <div className="flex items-center gap-2">
                                <Badge>{keyType || selectedKey.type}</Badge>
                                {selectedKey.ttl && (
                                    <Badge variant="outline" className="flex items-center gap-1">
                                        <Clock className="h-3 w-3" />
                                        {selectedKey.ttl}s
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </CardHeader>
                    <CardContent className="flex-1 overflow-hidden">
                        <ScrollArea className="h-full">
                            {renderValue()}
                        </ScrollArea>
                    </CardContent>
                </Card>
            ) : (
                <div className="flex-1 flex items-center justify-center">
                    <div className="text-center space-y-2">
                        <Key className="h-12 w-12 mx-auto text-muted-foreground/50" />
                        <p className="text-muted-foreground">
                            Select a key from the sidebar to view its value
                        </p>
                    </div>
                </div>
            )}
        </div>
    )
}
