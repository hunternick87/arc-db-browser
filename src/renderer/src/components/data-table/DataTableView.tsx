import { useState, useEffect, useCallback, useRef } from 'react'
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    SortingState,
    ColumnFiltersState,
    VisibilityState,
    ColumnDef,
    RowSelectionState
} from '@tanstack/react-table'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area'
import { Skeleton } from '@/components/ui/skeleton'
import { useConnection } from '@/contexts/ConnectionContext'
import type { TableInfo, QueryResult, QueryColumn } from '@/lib/types'
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    ArrowUpDown,
    ArrowUp,
    ArrowDown,
    Columns3,
    Search,
    Plus,
    X,
    Trash2
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'

interface DataTableViewProps {
    selectedTable: TableInfo | null
    onTableSelect?: (table: TableInfo) => void
}

// Editable cell component
function EditableCell({
    value,
    onSave,
    columnType
}: {
    value: unknown
    onSave: (newValue: unknown) => void
    columnType?: string
}) {
    const [isEditing, setIsEditing] = useState(false)
    const [editValue, setEditValue] = useState('')
    const inputRef = useRef<HTMLInputElement>(null)
    const cellRef = useRef<HTMLDivElement>(null)

    const handleDoubleClick = () => {
        setIsEditing(true)
        setEditValue(value === null || value === undefined ? '' : String(value))
    }

    useEffect(() => {
        if (isEditing && inputRef.current) {
            inputRef.current.focus()
            inputRef.current.select()
        }
    }, [isEditing])

    const handleSave = () => {
        // Convert value based on original type
        let newValue: unknown = editValue
        if (editValue === '' || editValue.toLowerCase() === 'null') {
            newValue = null
        } else if (!isNaN(Number(editValue)) && typeof value === 'number') {
            newValue = Number(editValue)
        }
        onSave(newValue)
        setIsEditing(false)
    }

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            handleSave()
        } else if (e.key === 'Escape') {
            setIsEditing(false)
        }
    }

    // Consistent cell height for both states
    const cellClasses = "h-7 flex items-center w-full"

    if (isEditing) {
        return (
            <div className={cellClasses}>
                <Input
                    ref={inputRef}
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleSave}
                    onKeyDown={handleKeyDown}
                    className="h-7 text-sm w-full min-w-0"
                />
            </div>
        )
    }

    return (
        <div
            ref={cellRef}
            onDoubleClick={handleDoubleClick}
            className={`${cellClasses} cursor-pointer hover:bg-muted/50 px-1 rounded truncate`}
            title={value === null ? 'null' : value === undefined ? 'undefined' : String(value)}
        >
            {value === null ? (
                <span className="text-muted-foreground italic">null</span>
            ) : value === undefined ? (
                <span className="text-muted-foreground italic">undefined</span>
            ) : typeof value === 'object' ? (
                JSON.stringify(value)
            ) : (
                String(value)
            )}
        </div>
    )
}

export function DataTableView({ selectedTable }: DataTableViewProps): React.JSX.Element {
    const { activeConnection } = useConnection()
    const [data, setData] = useState<Record<string, unknown>[]>([])
    const [columnSchema, setColumnSchema] = useState<QueryColumn[]>([])
    const [columns, setColumns] = useState<ColumnDef<Record<string, unknown>>[]>([])
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [totalRows, setTotalRows] = useState(0)
    const [executionTime, setExecutionTime] = useState<number | null>(null)

    // Insert row state
    const [newRowValues, setNewRowValues] = useState<Record<string, string>>({})
    const [isInserting, setIsInserting] = useState(false)

    // Table state
    const [sorting, setSorting] = useState<SortingState>([])
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
    const [globalFilter, setGlobalFilter] = useState('')
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({})

    // Pagination
    const [pageIndex, setPageIndex] = useState(0)
    const [pageSize, setPageSize] = useState(50)

    // If the user changes the db connect as they are in a table, reset state
    useEffect(() => {
        setData([])
        setColumnSchema([])
        setColumns([])
        setIsLoading(false)
        setError(null)
        setTotalRows(0)
        setExecutionTime(null)
        setNewRowValues({})
        setIsInserting(false)
        setSorting([])
        setColumnFilters([])
        setColumnVisibility({})
        setGlobalFilter('')
        setRowSelection({})
        setPageIndex(0)
        setPageSize(50)
    }, [activeConnection, selectedTable])

    // Refresh function
    const refreshData = useCallback(async () => {
        if (!selectedTable || !activeConnection) return

        setIsLoading(true)
        setError(null)

        try {
            // Get schema first for column types
            const schemaResult = await window.api.getTableSchema(
                activeConnection.connection.id,
                selectedTable.name
            )
            if (schemaResult.success && schemaResult.schema) {
                setColumnSchema(schemaResult.schema)
                // Initialize new row values with empty strings
                const initialValues: Record<string, string> = {}
                schemaResult.schema.forEach(col => {
                    initialValues[col.name] = ''
                })
                setNewRowValues(initialValues)
            }

            const result = await window.api.getTableData(
                activeConnection.connection.id,
                selectedTable.name,
                pageSize,
                pageIndex * pageSize
            )

            if (!result.success) {
                throw new Error(result.error)
            }

            const queryResult = result.data as QueryResult
            setData(queryResult.rows)
            setTotalRows(queryResult.rowCount)
            setExecutionTime(queryResult.executionTime ?? null)

        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }, [selectedTable, activeConnection, pageIndex, pageSize])

    // Handle cell update
    const handleCellUpdate = useCallback(async (
        rowIndex: number,
        columnName: string,
        newValue: unknown
    ) => {
        if (!selectedTable || !activeConnection) return

        const row = data[rowIndex]
        const oldValue = row[columnName]

        // Don't update if value hasn't changed
        if (oldValue === newValue) return

        // Find primary key column (assume first column for now)
        const primaryKeyCol = columnSchema[0]?.name || Object.keys(row)[0]
        const primaryKeyValue = row[primaryKeyCol]

        try {
            const result = await window.api.updateRow(
                activeConnection.connection.id,
                selectedTable.name,
                { column: primaryKeyCol, value: primaryKeyValue },
                { [columnName]: newValue }
            )

            if (!result.success) {
                throw new Error(result.error)
            }

            // Update local data
            setData(prev => {
                const newData = [...prev]
                newData[rowIndex] = { ...newData[rowIndex], [columnName]: newValue }
                return newData
            })
        } catch (err) {
            setError((err as Error).message)
        }
    }, [selectedTable, activeConnection, data, columnSchema])

    // Handle insert row
    const handleInsertRow = useCallback(async () => {
        if (!selectedTable || !activeConnection) return

        setIsInserting(true)
        setError(null)

        try {
            // Convert string values to appropriate types
            const rowData: Record<string, unknown> = {}
            Object.entries(newRowValues).forEach(([col, val]) => {
                if (val === '' || val.toLowerCase() === 'null') {
                    rowData[col] = null
                } else if (!isNaN(Number(val))) {
                    rowData[col] = Number(val)
                } else {
                    rowData[col] = val
                }
            })

            // Filter out empty/null values for optional columns
            const filteredData: Record<string, unknown> = {}
            Object.entries(rowData).forEach(([col, val]) => {
                if (val !== null && val !== '') {
                    filteredData[col] = val
                }
            })

            if (Object.keys(filteredData).length === 0) {
                throw new Error('Please fill in at least one field')
            }

            const result = await window.api.insertRow(
                activeConnection.connection.id,
                selectedTable.name,
                filteredData
            )

            if (!result.success) {
                throw new Error(result.error)
            }

            // Clear input fields
            const clearedValues: Record<string, string> = {}
            columnSchema.forEach(col => {
                clearedValues[col.name] = ''
            })
            setNewRowValues(clearedValues)

            // Refresh data to show new row
            await refreshData()
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsInserting(false)
        }
    }, [selectedTable, activeConnection, newRowValues, columnSchema, refreshData])

    // Delete selected rows
    const handleDeleteSelected = useCallback(async () => {
        if (!selectedTable || !activeConnection) return

        const selectedRows = Object.keys(rowSelection).map(idx => data[parseInt(idx)])
        if (selectedRows.length === 0) return

        const primaryKeyCol = columnSchema[0]?.name || Object.keys(data[0] || {})[0]

        setError(null)
        try {
            for (const row of selectedRows) {
                const result = await window.api.deleteRow(
                    activeConnection.connection.id,
                    selectedTable.name,
                    { column: primaryKeyCol, value: row[primaryKeyCol] }
                )
                if (!result.success) {
                    throw new Error(result.error)
                }
            }
            setRowSelection({})
            await refreshData()
        } catch (err) {
            setError((err as Error).message)
        }
    }, [selectedTable, activeConnection, rowSelection, data, columnSchema, refreshData])

    // Load data when table changes
    useEffect(() => {
        refreshData()
        setRowSelection({}) // Clear selection when changing tables
    }, [refreshData])

    // Generate columns with editable cells
    useEffect(() => {
        if (columnSchema.length === 0) return

        // Row number/select column
        const selectColumn: ColumnDef<Record<string, unknown>> = {
            id: 'select',
            size: 60,
            minSize: 60,
            maxSize: 60,
            enableResizing: false,
            header: ({ table }) => (
                <div className="flex items-center justify-center">
                    <Checkbox
                        checked={table.getIsAllPageRowsSelected()}
                        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
                        aria-label="Select all"
                    />
                </div>
            ),
            cell: ({ row }) => (
                <div
                    className="flex items-center justify-center gap-1 cursor-pointer"
                    onClick={() => row.toggleSelected()}
                >
                    <Checkbox
                        checked={row.getIsSelected()}
                        onCheckedChange={(value) => row.toggleSelected(!!value)}
                        aria-label="Select row"
                    />
                    <span className="text-xs text-muted-foreground w-6 text-right">
                        {(pageIndex * pageSize) + row.index + 1}
                    </span>
                </div>
            )
        }

        const generatedColumns: ColumnDef<Record<string, unknown>>[] = columnSchema.map(col => ({
            accessorKey: col.name,
            size: 180,
            minSize: 80,
            maxSize: 400,
            header: ({ column }) => (
                <Button
                    variant="ghost"
                    onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
                    className="h-8 px-2 -ml-2 w-full justify-start"
                >
                    <span className="truncate">{col.name}</span>
                    <span className="ml-1 text-xs text-muted-foreground shrink-0">
                        {col.type ? `(${col.type})` : ''}
                    </span>
                    {column.getIsSorted() === 'asc' ? (
                        <ArrowUp className="ml-2 h-4 w-4 shrink-0" />
                    ) : column.getIsSorted() === 'desc' ? (
                        <ArrowDown className="ml-2 h-4 w-4 shrink-0" />
                    ) : (
                        <ArrowUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
                    )}
                </Button>
            ),
            cell: ({ getValue, row }) => (
                <EditableCell
                    value={getValue()}
                    columnType={col.type}
                    onSave={(newValue) => handleCellUpdate(row.index, col.name, newValue)}
                />
            )
        }))

        setColumns([selectColumn, ...generatedColumns])
    }, [columnSchema, handleCellUpdate, pageIndex, pageSize])

    // Reset pagination and selection when table changes
    useEffect(() => {
        setPageIndex(0)
        setRowSelection({})
    }, [selectedTable])

    const table = useReactTable({
        data,
        columns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onGlobalFilterChange: setGlobalFilter,
        onRowSelectionChange: setRowSelection,
        columnResizeMode: 'onChange',
        enableRowSelection: true,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            globalFilter,
            rowSelection
        },
        manualPagination: true,
        pageCount: Math.ceil(totalRows / pageSize)
    })

    const pageCount = Math.ceil(totalRows / pageSize)

    if (!selectedTable) {
        return (
            <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                    <p className="text-muted-foreground">
                        Select a table from the sidebar to view its data
                    </p>
                </div>
            </div>
        )
    }

    return (
        <div className="flex flex-col h-full w-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
                <div className="flex items-center gap-4">
                    <h2 className="text-lg font-semibold">{selectedTable.name}</h2>
                    <span className="text-sm text-muted-foreground">
                        {totalRows.toLocaleString()} rows
                        {executionTime !== null && ` • ${executionTime.toFixed(2)}ms`}
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {Object.keys(rowSelection).length > 0 && (
                        <Button
                            variant="destructive"
                            size="sm"
                            onClick={handleDeleteSelected}
                        >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Delete ({Object.keys(rowSelection).length})
                        </Button>
                    )}
                    <div className="relative">
                        <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                        <Input
                            placeholder="Filter..."
                            value={globalFilter ?? ''}
                            onChange={(e) => setGlobalFilter(e.target.value)}
                            className="pl-8 w-[200px]"
                        />
                    </div>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="outline" size="sm">
                                <Columns3 className="h-4 w-4 mr-2" />
                                Columns
                                <ChevronDown className="ml-2 h-4 w-4" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[200px]">
                            {table.getAllColumns()
                                .filter((column) => column.getCanHide())
                                .map((column) => (
                                    <DropdownMenuCheckboxItem
                                        key={column.id}
                                        checked={column.getIsVisible()}
                                        onCheckedChange={(value) => column.toggleVisibility(!!value)}
                                    >
                                        {column.id}
                                    </DropdownMenuCheckboxItem>
                                ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* Error display */}
            {error && (
                <div className="px-4 py-2 bg-destructive/10 text-destructive text-sm flex items-center justify-between">
                    {error.charAt(0).toUpperCase() + error.slice(1)}
                    <Button
                        variant="ghost"
                        size="sm"
                        className="ml-2 h-6"
                        onClick={() => setError(null)}
                    >
                        <X className="h-3 w-3" />
                    </Button>
                </div>
            )}

            {/* Table */}
            <ScrollArea className="flex-1 w-full overflow-auto">
                {isLoading ? (
                    <div className="p-4 space-y-2">
                        {Array.from({ length: 10 }).map((_, i) => (
                            <Skeleton key={i} className="h-10 w-full" />
                        ))}
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <Table style={{ minWidth: table.getCenterTotalSize(), tableLayout: 'fixed' }}>
                            <TableHeader className="sticky top-0 bg-background z-10">
                                {table.getHeaderGroups().map((headerGroup) => (
                                    <TableRow key={headerGroup.id}>
                                        {headerGroup.headers.map((header) => (
                                            <TableHead
                                                key={header.id}
                                                className="whitespace-nowrap relative group"
                                                style={{ width: header.getSize() }}
                                            >
                                                {header.isPlaceholder
                                                    ? null
                                                    : flexRender(
                                                        header.column.columnDef.header,
                                                        header.getContext()
                                                    )}
                                                {/* Resize handle */}
                                                <div
                                                    onMouseDown={header.getResizeHandler()}
                                                    onTouchStart={header.getResizeHandler()}
                                                    className={`absolute right-0 top-0 h-full w-1 cursor-col-resize select-none touch-none bg-border opacity-0 group-hover:opacity-100 hover:bg-primary ${header.column.getIsResizing() ? 'bg-primary opacity-100' : ''
                                                        }`}
                                                />
                                            </TableHead>
                                        ))}
                                        <TableHead className="w-10" />
                                    </TableRow>
                                ))}
                                {/* Insert Row */}
                                <TableRow className="bg-muted/30 hover:bg-muted/50">
                                    {columnSchema.map((col) => (
                                        <TableHead key={`insert-${col.name}`} className="p-1">
                                            <Input
                                                placeholder={col.type || col.name}
                                                value={newRowValues[col.name] || ''}
                                                onChange={(e) => setNewRowValues(prev => ({
                                                    ...prev,
                                                    [col.name]: e.target.value
                                                }))}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !isInserting) {
                                                        handleInsertRow()
                                                    }
                                                }}
                                                className="h-8 text-sm bg-background"
                                                disabled={isInserting}
                                            />
                                        </TableHead>
                                    ))}
                                    <TableHead className="p-1 w-10">
                                        <Button
                                            size="icon"
                                            variant="ghost"
                                            className="h-8 w-8"
                                            onClick={handleInsertRow}
                                            disabled={isInserting}
                                            title="Insert row (Enter)"
                                        >
                                            {isInserting ? (
                                                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                                            ) : (
                                                <Plus className="h-4 w-4" />
                                            )}
                                        </Button>
                                    </TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {table.getRowModel().rows.length ? (
                                    table.getRowModel().rows.map((row) => (
                                        <TableRow key={row.id}>
                                            {row.getVisibleCells().map((cell) => (
                                                <TableCell
                                                    key={cell.id}
                                                    className="overflow-hidden"
                                                    style={{ width: cell.column.getSize() }}
                                                >
                                                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                                </TableCell>
                                            ))}
                                            <TableCell className="w-10" />
                                        </TableRow>
                                    ))
                                ) : (
                                    <TableRow>
                                        <TableCell colSpan={columns.length + 1} className="h-24 text-center">
                                            No results.
                                        </TableCell>
                                    </TableRow>
                                )}
                            </TableBody>
                        </Table>
                    </div>
                )}
                <ScrollBar orientation="horizontal" />
            </ScrollArea>
            {/* Pagination */}
            <div className="flex items-center justify-between p-4 border-t border-border shrink-0">
                <div className="text-sm text-muted-foreground">
                    Page {pageIndex + 1} of {pageCount || 1}
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPageIndex(0)}
                        disabled={pageIndex === 0 || isLoading}
                    >
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPageIndex(p => p - 1)}
                        disabled={pageIndex === 0 || isLoading}
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPageIndex(p => p + 1)}
                        disabled={pageIndex >= pageCount - 1 || isLoading}
                    >
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        size="icon"
                        onClick={() => setPageIndex(pageCount - 1)}
                        disabled={pageIndex >= pageCount - 1 || isLoading}
                    >
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    )
}
