import { useState } from 'react'
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
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { useConnection } from '@/contexts/ConnectionContext'
import type { DatabaseType, DatabaseConnection } from '@/lib/types'
import { Loader2, FolderOpen } from 'lucide-react'

interface ConnectionDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
}

export function ConnectionDialog({ open, onOpenChange }: ConnectionDialogProps): React.JSX.Element {
    const { addConnection } = useConnection()
    const [type, setType] = useState<DatabaseType>('sqlite')
    const [name, setName] = useState('')
    const [isLoading, setIsLoading] = useState(false)
    const [error, setError] = useState<string | null>(null)

    // SQLite fields
    const [filePath, setFilePath] = useState('')

    // PostgreSQL fields
    const [host, setHost] = useState('localhost')
    const [port, setPort] = useState('5432')
    const [database, setDatabase] = useState('')
    const [user, setUser] = useState('postgres')
    const [password, setPassword] = useState('')
    const [ssl, setSsl] = useState(false)

    // Valkey fields
    const [valkeyHost, setValkeyHost] = useState('localhost')
    const [valkeyPort, setValkeyPort] = useState('6379')
    const [valkeyPassword, setValkeyPassword] = useState('')
    const [valkeyDb, setValkeyDb] = useState('0')

    const resetForm = () => {
        setName('')
        setFilePath('')
        setHost('localhost')
        setPort('5432')
        setDatabase('')
        setUser('postgres')
        setPassword('')
        setSsl(false)
        setValkeyHost('localhost')
        setValkeyPort('6379')
        setValkeyPassword('')
        setValkeyDb('0')
        setError(null)
    }

    const handleBrowseFile = async () => {
        const result = await window.api.pickSqliteFile()
        if (result.success && result.filePath) {
            setFilePath(result.filePath)
            if (!name) {
                // Auto-fill name from file name
                const fileName = result.filePath.split(/[\\/]/).pop()?.replace(/\.[^/.]+$/, '') || ''
                setName(fileName)
            }
        }
    }

    const handleSave = async () => {
        setError(null)
        setIsLoading(true)

        try {
            let connection: DatabaseConnection

            const id = crypto.randomUUID()

            switch (type) {
                case 'sqlite':
                    if (!filePath) throw new Error('Please select a database file')
                    connection = {
                        id,
                        name: name || 'SQLite Database',
                        type: 'sqlite',
                        filePath
                    }
                    break

                case 'postgres':
                    if (!database) throw new Error('Database name is required')
                    connection = {
                        id,
                        name: name || `${database}@${host}`,
                        type: 'postgres',
                        host,
                        port: parseInt(port, 10),
                        database,
                        user,
                        password,
                        ssl
                    }
                    break

                case 'valkey':
                    connection = {
                        id,
                        name: name || `Valkey@${valkeyHost}`,
                        type: 'valkey',
                        host: valkeyHost,
                        port: parseInt(valkeyPort, 10),
                        password: valkeyPassword || undefined,
                        db: parseInt(valkeyDb, 10)
                    }
                    break

                default:
                    throw new Error('Invalid database type')
            }

            // Test connection
            const testResult = await window.api.testConnection(connection)
            if (!testResult.success) {
                throw new Error(testResult.error || 'Connection test failed')
            }

            addConnection(connection)
            resetForm()
            onOpenChange(false)
        } catch (err) {
            setError((err as Error).message)
        } finally {
            setIsLoading(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                    <DialogTitle>New Connection</DialogTitle>
                    <DialogDescription>
                        Create a new database connection
                    </DialogDescription>
                </DialogHeader>

                <div className="grid gap-4 py-4">
                    {/* Database Type */}
                    <div className="grid gap-2">
                        <Label htmlFor="type">Database Type</Label>
                        <Select value={type} onValueChange={(v) => setType(v as DatabaseType)}>
                            <SelectTrigger>
                                <SelectValue placeholder="Select database type" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="sqlite">SQLite</SelectItem>
                                <SelectItem value="postgres">PostgreSQL</SelectItem>
                                <SelectItem value="valkey">Valkey / Redis</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>

                    {/* Connection Name */}
                    <div className="grid gap-2">
                        <Label htmlFor="name">Connection Name</Label>
                        <Input
                            id="name"
                            placeholder="My Database"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                        />
                    </div>

                    {/* SQLite Fields */}
                    {type === 'sqlite' && (
                        <div className="grid gap-2">
                            <Label htmlFor="filePath">Database File</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="filePath"
                                    placeholder="/path/to/database.db"
                                    value={filePath}
                                    onChange={(e) => setFilePath(e.target.value)}
                                    className="flex-1"
                                />
                                <Button variant="outline" size="icon" onClick={handleBrowseFile}>
                                    <FolderOpen className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* PostgreSQL Fields */}
                    {type === 'postgres' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="host">Host</Label>
                                    <Input
                                        id="host"
                                        value={host}
                                        onChange={(e) => setHost(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="port">Port</Label>
                                    <Input
                                        id="port"
                                        type="number"
                                        value={port}
                                        onChange={(e) => setPort(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="database">Database</Label>
                                <Input
                                    id="database"
                                    placeholder="postgres"
                                    value={database}
                                    onChange={(e) => setDatabase(e.target.value)}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="user">Username</Label>
                                    <Input
                                        id="user"
                                        value={user}
                                        onChange={(e) => setUser(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="password">Password</Label>
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="ssl"
                                    checked={ssl}
                                    onCheckedChange={(checked) => setSsl(!!checked)}
                                />
                                <Label htmlFor="ssl" className="font-normal">
                                    Use SSL
                                </Label>
                            </div>
                        </>
                    )}

                    {/* Valkey Fields */}
                    {type === 'valkey' && (
                        <>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="valkeyHost">Host</Label>
                                    <Input
                                        id="valkeyHost"
                                        value={valkeyHost}
                                        onChange={(e) => setValkeyHost(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="valkeyPort">Port</Label>
                                    <Input
                                        id="valkeyPort"
                                        type="number"
                                        value={valkeyPort}
                                        onChange={(e) => setValkeyPort(e.target.value)}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="grid gap-2">
                                    <Label htmlFor="valkeyPassword">Password</Label>
                                    <Input
                                        id="valkeyPassword"
                                        type="password"
                                        placeholder="Optional"
                                        value={valkeyPassword}
                                        onChange={(e) => setValkeyPassword(e.target.value)}
                                    />
                                </div>
                                <div className="grid gap-2">
                                    <Label htmlFor="valkeyDb">Database</Label>
                                    <Input
                                        id="valkeyDb"
                                        type="number"
                                        value={valkeyDb}
                                        onChange={(e) => setValkeyDb(e.target.value)}
                                    />
                                </div>
                            </div>
                        </>
                    )}

                    {/* Error Message */}
                    {error && (
                        <div className="text-sm text-destructive bg-destructive/10 p-2 rounded-md">
                            {error}
                        </div>
                    )}
                </div>

                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>
                        Cancel
                    </Button>
                    <Button onClick={handleSave} disabled={isLoading}>
                        {isLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                        Connect
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    )
}
