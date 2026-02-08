import { useState } from 'react'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { useConnection } from '@/contexts/ConnectionContext'
import type { QueryResult } from '@/lib/types'
import { Play, Clock, RowsIcon, AlertCircle } from 'lucide-react'

export function QueryEditor(): React.JSX.Element {
    const { activeConnection } = useConnection()
    const [query, setQuery] = useState('')
    const [result, setResult] = useState<QueryResult | null>(null)
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleExecute = async () => {
        if (!activeConnection || !query.trim()) return

        setIsLoading(true)
        setError(null)
        setResult(null)

        try {
            const response = await window.api.executeQuery(
                activeConnection.connection.id,
                query
            )

            if (!response.success) {
                throw new Error(response.error)
            }

            setResult(response.result || null)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        // Ctrl/Cmd + Enter to execute
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            e.preventDefault()
            handleExecute()
        }
    }

    return (
        <div className="flex flex-col h-full p-4 gap-4">
            {/* Query input */}
            <Card>
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">SQL Query</CardTitle>
                        <Button onClick={handleExecute} disabled={isLoading || !query.trim()}>
                            <Play className="h-4 w-4 mr-2" />
                            Execute
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <Textarea
                        placeholder="SELECT * FROM users LIMIT 100;"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        className="font-mono min-h-[120px] resize-y"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                        Press Ctrl+Enter to execute
                    </p>
                </CardContent>
            </Card>

            {/* Results */}
            <Card className="flex-1 flex flex-col overflow-hidden">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Results</CardTitle>
                        {result && (
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                <span className="flex items-center gap-1">
                                    <RowsIcon className="h-4 w-4" />
                                    {result.rowCount} rows
                                </span>
                                {result.executionTime !== undefined && (
                                    <span className="flex items-center gap-1">
                                        <Clock className="h-4 w-4" />
                                        {result.executionTime.toFixed(2)}ms
                                    </span>
                                )}
                            </div>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="flex-1 overflow-hidden">
                    {error ? (
                        <div className="flex items-start gap-2 p-4 bg-destructive/10 rounded-md text-destructive">
                            <AlertCircle className="h-5 w-5 mt-0.5 shrink-0" />
                            <pre className="text-sm whitespace-pre-wrap">{error}</pre>
                        </div>
                    ) : isLoading ? (
                        <div className="space-y-2">
                            {Array.from({ length: 5 }).map((_, i) => (
                                <Skeleton key={i} className="h-10 w-full" />
                            ))}
                        </div>
                    ) : result ? (
                        <ScrollArea className="h-full">
                            {result.columns.length > 0 ? (
                                <Table>
                                    <TableHeader className="sticky top-0 bg-background z-10">
                                        <TableRow>
                                            {result.columns.map((col, i) => (
                                                <TableHead key={i} className="whitespace-nowrap">
                                                    {col.name}
                                                </TableHead>
                                            ))}
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {result.rows.map((row, rowIndex) => (
                                            <TableRow key={rowIndex}>
                                                {result.columns.map((col, colIndex) => (
                                                    <TableCell key={colIndex} className="max-w-[300px] truncate font-mono text-sm">
                                                        {row[col.name] === null ? (
                                                            <span className="text-muted-foreground italic">null</span>
                                                        ) : typeof row[col.name] === 'object' ? (
                                                            JSON.stringify(row[col.name])
                                                        ) : (
                                                            String(row[col.name])
                                                        )}
                                                    </TableCell>
                                                ))}
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            ) : (
                                <div className="text-center py-8 text-muted-foreground">
                                    Query executed successfully. {result.rowCount} row(s) affected.
                                </div>
                            )}
                            <ScrollBar orientation="horizontal" />
                        </ScrollArea>
                    ) : (
                        <div className="flex items-center justify-center h-full text-muted-foreground">
                            Execute a query to see results
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
