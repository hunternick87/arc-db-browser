import { cn } from '@/lib/utils'
import {
    Database,
    Github,
    GitBranchPlus,
    Braces,
    Globe,
    TerminalSquare,
    type LucideIcon
} from 'lucide-react'

export type ToolkitMode = 'database' | 'github' | 'migration' | 'json' | 'api' | 'terminal'

interface ToolDefinition {
    mode: ToolkitMode
    label: string
    icon: LucideIcon
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
    { mode: 'database', label: 'Database', icon: Database },
    { mode: 'github', label: 'GitHub', icon: Github },
    { mode: 'migration', label: 'Migration', icon: GitBranchPlus },
    { mode: 'json', label: 'JSON Lab', icon: Braces },
    { mode: 'api', label: 'API', icon: Globe },
    { mode: 'terminal', label: 'Terminal', icon: TerminalSquare }
]

interface ToolRailProps {
    activeMode: ToolkitMode
    onModeChange: (mode: ToolkitMode) => void
    className?: string
}

export function ToolRail({ activeMode, onModeChange, className }: ToolRailProps): React.JSX.Element {
    return (
        <aside className={cn('w-16 border-r border-border bg-background', className)}>
            <div className="flex h-full flex-col items-center gap-1.5 p-1.5">
                {TOOL_DEFINITIONS.map(tool => {
                    const Icon = tool.icon
                    const isActive = tool.mode === activeMode

                    return (
                        <button
                            key={tool.mode}
                            type="button"
                            onClick={() => onModeChange(tool.mode)}
                            className={cn(
                                'flex w-full flex-col items-center gap-0.5 rounded-lg px-1 py-2 text-[10px] transition-colors',
                                'hover:bg-muted text-foreground',
                                isActive
                                    ? 'bg-primary/10 text-primary ring-1 ring-primary/20'
                                    : 'text-foreground/80'
                            )}
                            title={tool.label}
                        >
                            <Icon className="h-3.5 w-3.5" />
                            <span className="leading-tight text-center">{tool.label}</span>
                        </button>
                    )
                })}
            </div>
        </aside>
    )
}
