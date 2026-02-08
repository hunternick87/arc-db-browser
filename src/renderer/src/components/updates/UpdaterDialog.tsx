import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Download, RefreshCw, RotateCw } from 'lucide-react'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

type StatusKind = 'idle' | 'checking' | 'available' | 'none' | 'downloading' | 'downloaded' | 'error' | 'disabled'

export function UpdaterDialog({ open, onOpenChange }: Props): React.JSX.Element {
  const [enabled, setEnabled] = useState<boolean | null>(null)
  const [appVersion, setAppVersion] = useState<string | null>(null)
  const [statusKind, setStatusKind] = useState<StatusKind>('idle')
  const [statusText, setStatusText] = useState<string>('')
  const [availableVersion, setAvailableVersion] = useState<string | null>(null)
  const [downloadedVersion, setDownloadedVersion] = useState<string | null>(null)
  const [progressPercent, setProgressPercent] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  const statusBadge = useMemo(() => {
    switch (statusKind) {
      case 'available':
        return <Badge>Update available</Badge>
      case 'downloaded':
        return <Badge variant="secondary">Ready to install</Badge>
      case 'downloading':
        return <Badge variant="secondary">Downloading…</Badge>
      case 'checking':
        return <Badge variant="outline">Checking…</Badge>
      case 'none':
        return <Badge variant="outline">Up to date</Badge>
      case 'error':
        return <Badge variant="destructive">Error</Badge>
      case 'disabled':
        return <Badge variant="outline">Disabled</Badge>
      default:
        return <Badge variant="outline">Idle</Badge>
    }
  }, [statusKind])

  useEffect(() => {
    if (!open) return

    let unsubscribe: null | (() => void) = null

    setBusy(false)
    setProgressPercent(null)
    setStatusKind('idle')
    setStatusText('')
    setAvailableVersion(null)
    setDownloadedVersion(null)

    window.updater
      .isEnabled()
      .then((v) => {
        setEnabled(v)
        if (!v) {
          setStatusKind('disabled')
          setStatusText('Auto-updates are available in packaged builds (or set FORCE_UPDATER=1).')
        }
      })
      .catch(() => {
        setEnabled(false)
        setStatusKind('error')
        setStatusText('Updater API not available.')
      })

    // Optional API: only present once main updater module is loaded.
    ;(window.updater as unknown as { getAppVersion?: () => Promise<string> }).getAppVersion?.()
      ?.then((v) => setAppVersion(v))
      .catch(() => undefined)

    unsubscribe = window.updater.onEvent((event) => {
      switch (event.type) {
        case 'checking-for-update':
          setStatusKind('checking')
          setStatusText('Checking for updates…')
          setProgressPercent(null)
          return
        case 'update-available':
          setStatusKind('available')
          setAvailableVersion(event.version ?? null)
          setStatusText(`Update available${event.version ? `: ${event.version}` : ''}.`)
          return
        case 'update-not-available':
          setStatusKind('none')
          setAvailableVersion(null)
          setStatusText('No updates available.')
          return
        case 'download-progress':
          setStatusKind('downloading')
          setProgressPercent(event.percent)
          setStatusText(`Downloading… ${event.percent.toFixed(1)}%`)
          return
        case 'update-downloaded':
          setStatusKind('downloaded')
          setDownloadedVersion(event.version ?? null)
          setProgressPercent(100)
          setStatusText('Update downloaded. Restart to install.')
          return
        case 'error':
          setStatusKind('error')
          setStatusText(event.message)
          return
        case 'status':
          setStatusText(event.message)
          return
      }
    })

    return () => {
      unsubscribe?.()
    }
  }, [open])

  const doCheck = async () => {
    try {
      setBusy(true)
      await window.updater.checkForUpdates()
    } catch (e) {
      setStatusKind('error')
      setStatusText(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doDownload = async () => {
    try {
      setBusy(true)
      await window.updater.downloadUpdate()
    } catch (e) {
      setStatusKind('error')
      setStatusText(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  const doInstall = async () => {
    try {
      setBusy(true)
      await window.updater.quitAndInstall()
    } finally {
      setBusy(false)
    }
  }

  const canCheck = enabled !== false && !busy
  const canDownload = enabled !== false && statusKind === 'available' && !busy
  const canInstall = enabled !== false && statusKind === 'downloaded' && !busy

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Updates</DialogTitle>
          <DialogDescription>
            {appVersion ? `Current version: ${appVersion}` : 'Check for app updates.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {statusBadge}
              {availableVersion && <span className="text-sm text-muted-foreground">Latest: {availableVersion}</span>}
              {downloadedVersion && <span className="text-sm text-muted-foreground">Downloaded: {downloadedVersion}</span>}
            </div>
          </div>

          {statusText && (
            <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words">{statusText}</div>
          )}

          {progressPercent != null && (
            <div className="space-y-1">
              <div className="h-2 w-full rounded bg-muted overflow-hidden">
                <div
                  className="h-full bg-primary transition-[width]"
                  style={{ width: `${Math.max(0, Math.min(100, progressPercent))}%` }}
                />
              </div>
              <div className="text-xs text-muted-foreground">{progressPercent.toFixed(1)}%</div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={doCheck} disabled={!canCheck}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Check
          </Button>
          <Button variant="outline" onClick={doDownload} disabled={!canDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
          <Button onClick={doInstall} disabled={!canInstall}>
            <RotateCw className="h-4 w-4 mr-2" />
            Restart & Install
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
