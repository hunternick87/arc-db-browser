import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import type { ToolkitMode } from '@/components/layout/ToolRail'
import { Braces, Globe, Sparkles, TerminalSquare } from 'lucide-react'

const MODE_CONTENT: Record<Exclude<ToolkitMode, 'database' | 'github' | 'migration'>, {
    title: string
    description: string
    highlights: string[]
    icon: React.ComponentType<{ className?: string }>
}> = {
    json: {
        title: 'JSON Lab',
        description: 'Inspect, format, and diff payloads while you work on services.',
        highlights: ['Formatter presets', 'Schema validation', 'JSON diff snapshots'],
        icon: Braces
    },
    api: {
        title: 'API Console',
        description: 'Craft requests and inspect responses without leaving the desktop app.',
        highlights: ['Saved request collections', 'Auth profiles', 'Response history'],
        icon: Globe
    },
    terminal: {
        title: 'Task Runner',
        description: 'Quick access panel for scripts, migrations, and diagnostics.',
        highlights: ['Pinned scripts', 'Task output stream', 'Reusable command snippets'],
        icon: TerminalSquare
    }
}

interface ToolkitWorkbenchProps {
    mode: Exclude<ToolkitMode, 'database' | 'github' | 'migration'>
}

export function ToolkitWorkbench({ mode }: ToolkitWorkbenchProps): React.JSX.Element {
    const content = MODE_CONTENT[mode]
    const Icon = content.icon

    return (
        <div className="flex flex-1 items-center justify-center overflow-auto p-6">
            <Card className="w-full max-w-3xl border-dashed">
                <CardHeader>
                    <div className="mb-2 flex items-center gap-2">
                        <Badge variant="secondary" className="gap-1">
                            <Sparkles className="h-3.5 w-3.5" />
                            Toolkit Mode
                        </Badge>
                    </div>
                    <CardTitle className="flex items-center gap-2 text-xl">
                        <Icon className="h-5 w-5 text-primary" />
                        {content.title}
                    </CardTitle>
                    <CardDescription>{content.description}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-2">
                    {content.highlights.map(item => (
                        <div key={item} className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                            {item}
                        </div>
                    ))}
                </CardContent>
            </Card>
        </div>
    )
}
