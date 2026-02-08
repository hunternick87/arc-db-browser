import { useEffect, useState } from 'react'
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
    Database,
    Edit2,
    Trash2,
    Server,
    HardDrive,
    Key,
    Save,
    X,
    Loader2,
    AlertTriangle,
    Eye,
    EyeOff
} from 'lucide-react'
import { useConnection } from '@/contexts/ConnectionContext'
import type { DatabaseConnection } from '@/lib/types'

interface ConnectionManagerDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ConnectionManagerDialog({
    open,
    onOpenChange
}: ConnectionManagerDialogProps): React.JSX.Element {
    const { connections, refreshConnections } = useConnection()

    const [hiddenConnections, setHiddenConnections] = useState<string[]>([])
    const [editingId, setEditingId] = useState<string | null>(null)
    const [editName, setEditName] = useState('')
    const [deleteId, setDeleteId] = useState<string | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [isDeleting, setIsDeleting] = useState(false)

    const connectionToDelete = connections.find(c => c.id === deleteId)

    useEffect(() => {
        connections.forEach(conn => {
            // @ts-ignore - using metadata to track hidden state without modifying the original connection type
            if (conn.metadata?.hidden) {
                if (!hiddenConnections.includes(conn.id)) {
                    setHiddenConnections(prev => [...prev, conn.id])
                }
            } else {
                if (hiddenConnections.includes(conn.id)) {
                    setHiddenConnections(prev => prev.filter(id => id !== conn.id))
                }
            }
        })
    }, [connections])

    const handleHide = async (conn: DatabaseConnection) => {
        const updatedConnection = {
            ...conn,
            metadata: {
                // @ts-ignore - using metadata to track hidden state without modifying the original connection type
                ...conn.metadata,
                hidden: !hiddenConnections.includes(conn.id)
            }
        }
        await window.api.saveStoredConnection(updatedConnection)
        await refreshConnections()
    }


    const handleStartEdit = (conn: DatabaseConnection) => {
        setEditingId(conn.id)
        setEditName(conn.name)
    }

    const handleCancelEdit = () => {
        setEditingId(null)
        setEditName('')
    }

    const handleSaveEdit = async (conn: DatabaseConnection) => {
        if (!editName.trim()) return

        setIsSaving(true)
        try {
            // Update connection with new name
            const updatedConnection = {
                ...conn,
                name: editName.trim()
            }
            await window.api.saveStoredConnection(updatedConnection)
            await refreshConnections()
            setEditingId(null)
            setEditName('')
        } catch (err) {
            console.error('Failed to save connection:', err)
        } finally {
            setIsSaving(false)
        }
    }

    const handleDelete = async () => {
        if (!deleteId) return

        setIsDeleting(true)
        try {
            await window.api.deleteStoredConnection(deleteId)
            await refreshConnections()
            setDeleteId(null)
        } catch (err) {
            console.error('Failed to delete connection:', err)
        } finally {
            setIsDeleting(false)
        }
    }

    const getConnectionIcon = (type: string) => {
        switch (type) {
            case 'sqlite':
                return <HardDrive className="h-4 w-4" />
            case 'postgres':
                return <Server className="h-4 w-4" />
            case 'valkey':
                return <Key className="h-4 w-4" />
            default:
                return <Database className="h-4 w-4" />
        }
    }

    const getConnectionBadgeColor = (type: string) => {
        switch (type) {
            case 'sqlite':
                return 'bg-blue-500/10 text-blue-500 border-blue-500/20'
            case 'postgres':
                return 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20'
            case 'valkey':
                return 'bg-red-500/10 text-red-500 border-red-500/20'
            default:
                return ''
        }
    }

    const getConnectionDetails = (conn: DatabaseConnection) => {
        if (conn.type === 'sqlite') {
            return conn.filePath || 'No path specified'
        }
        if (conn.type === 'postgres') {
            return `${conn.host || 'localhost'}:${conn.port || 5432}/${conn.database || ''}`
        }
        if (conn.type === 'valkey') {
            return `${conn.host || 'localhost'}:${conn.port || 6379}`
        }
        return ''
    }

    return (
        <>
            <Dialog open={open && !deleteId} onOpenChange={onOpenChange}>
                <DialogContent className="sm:max-w-xl">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Database className="h-5 w-5 text-primary" />
                            Manage Connections
                        </DialogTitle>
                        <DialogDescription>
                            Edit or delete your saved database connections
                        </DialogDescription>
                    </DialogHeader>

                    <ScrollArea className="max-h-[400px] -mx-6 px-6">
                        {connections.length === 0 ? (
                            <div className="py-12 text-center">
                                <Database className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                                <p className="text-sm text-muted-foreground">
                                    No saved connections yet
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 gap-2 flex flex-col">
                                {connections.map((conn) => (
                                    <div
                                        key={conn.id}
                                        className="border rounded-lg p-4 bg-card hover:bg-muted/50 transition-colors"
                                    >
                                        {editingId === conn.id ? (
                                            // Edit Mode
                                            <div className="space-y-3 gap-3 flex flex-col">
                                                <div className="flex items-center gap-2">
                                                    {getConnectionIcon(conn.type)}
                                                    <Badge
                                                        variant="outline"
                                                        className={getConnectionBadgeColor(conn.type)}
                                                    >
                                                        {conn.type}
                                                    </Badge>
                                                </div>
                                                <div className="space-y-2 flex flex-row gap-2">
                                                    <Label htmlFor={`edit-name-${conn.id}`}>Name</Label>
                                                    <Input
                                                        id={`edit-name-${conn.id}`}
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        placeholder="Connection name"
                                                        autoFocus
                                                    />
                                                </div>
                                                {/* <div className="space-y-2 flex flex-row gap-2">
                                                    <Label htmlFor={`edit-name-${conn.id}`}>IP:Port</Label>
                                                    <Input
                                                        id={`edit-ip-${conn.id}`}
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        placeholder="192.168.1.10"
                                                    />
                                                    <Input
                                                        id={`edit-port-${conn.id}`}
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        placeholder="5435"
                                                    />
                                                </div>
                                                <div className="space-y-2 flex flex-row gap-2">
                                                    <Label htmlFor={`edit-username-${conn.id}`}>Username</Label>
                                                    <Input
                                                        id={`edit-username-${conn.id}`}
                                                        value={editName}
                                                        onChange={(e) => setEditName(e.target.value)}
                                                        placeholder="admin"
                                                    />
                                                </div> */}
                                                <div className="flex items-center gap-2 justify-end">
                                                    <Button
                                                        variant="outline"
                                                        size="sm"
                                                        onClick={handleCancelEdit}
                                                        disabled={isSaving}
                                                    >
                                                        <X className="h-4 w-4 mr-1" />
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        onClick={() => handleSaveEdit(conn)}
                                                        disabled={isSaving || !editName.trim()}
                                                    >
                                                        {isSaving ? (
                                                            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                        ) : (
                                                            <Save className="h-4 w-4 mr-1" />
                                                        )}
                                                        Save
                                                    </Button>
                                                </div>
                                            </div>
                                        ) : (
                                            // View Mode
                                            <div className="flex items-center gap-3">
                                                <div className="p-2 rounded-md bg-muted">
                                                    {getConnectionIcon(conn.type)}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-medium truncate">
                                                            {conn.name}
                                                        </span>
                                                        <Badge
                                                            variant="outline"
                                                            className={`shrink-0 ${getConnectionBadgeColor(conn.type)}`}
                                                        >
                                                            {conn.type}
                                                        </Badge>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground truncate mt-0.5">
                                                        {getConnectionDetails(conn)}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleHide(conn)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        {/* @ts-ignore */}
                                                        {conn?.metadata?.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => handleStartEdit(conn)}
                                                        className="h-8 w-8 p-0"
                                                    >
                                                        <Edit2 className="h-4 w-4" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => setDeleteId(conn.id)}
                                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                                    >
                                                        <Trash2 className="h-4 w-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </ScrollArea>

                    <Separator />

                    <DialogFooter>
                        <Button variant="outline" onClick={() => onOpenChange(false)}>
                            Done
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangle className="h-5 w-5" />
                            Delete Connection
                        </DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>"{connectionToDelete?.name}"</strong>?
                            This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => setDeleteId(null)}
                            disabled={isDeleting}
                        >
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDelete}
                            disabled={isDeleting}
                        >
                            {isDeleting ? (
                                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                                <Trash2 className="h-4 w-4 mr-2" />
                            )}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    )
}
