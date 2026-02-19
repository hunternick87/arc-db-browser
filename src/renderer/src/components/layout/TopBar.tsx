import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Maximize2, Minimize2, Minus, X } from 'lucide-react'

export function TopBar(): React.JSX.Element {
    const [isMaximized, setIsMaximized] = useState(false)

    const refreshMaximizedState = useCallback(async () => {
        const maximized = await window.windowControls.isMaximized()
        setIsMaximized(maximized)
    }, [])

    useEffect(() => {
        refreshMaximizedState()
    }, [refreshMaximizedState])

    const handleMinimize = async () => {
        await window.windowControls.minimize()
    }

    const handleToggleMaximize = async () => {
        const maximized = await window.windowControls.toggleMaximize()
        setIsMaximized(maximized)
    }

    const handleClose = async () => {
        await window.windowControls.close()
    }

    return (
        <div
            className="h-10 border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/75 flex items-center justify-between px-2 shrink-0 select-none"
            onDoubleClick={handleToggleMaximize}
            style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
        >
            <div className="px-2 text-sm font-medium text-foreground">Arc DB Browser</div>
            <div className="flex items-center gap-1" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleMinimize}
                    title="Minimize"
                >
                    <Minus className="h-4 w-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleToggleMaximize}
                    title={isMaximized ? 'Restore' : 'Maximize'}
                >
                    {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
                </Button>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:bg-destructive/20 hover:text-destructive"
                    onClick={handleClose}
                    title="Close"
                >
                    <X className="h-4 w-4" />
                </Button>
            </div>
        </div>
    )
}
