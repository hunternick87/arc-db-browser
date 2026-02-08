import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdaterEvent =
  | { type: 'status'; message: string }
  | { type: 'checking-for-update' }
  | { type: 'update-available'; version?: string }
  | { type: 'update-not-available'; version?: string }
  | { type: 'download-progress'; percent: number; transferred: number; total: number; bytesPerSecond: number }
  | { type: 'update-downloaded'; version?: string }
  | { type: 'error'; message: string }

let ipcRegistered = false
let updaterWired = false

function isUpdaterEnabled(): boolean {
  // electron-updater only makes sense for packaged builds, but allow
  // forcing it on for local testing.
  return app.isPackaged || process.env.FORCE_UPDATER === '1'
}

function send(mainWindow: BrowserWindow | null | undefined, event: UpdaterEvent): void {
  if (!mainWindow || mainWindow.isDestroyed()) return
  mainWindow.webContents.send('updater:event', event)
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  try {
    return JSON.stringify(error)
  } catch {
    return String(error)
  }
}

function configureLogging(): void {
  // electron-log is optional; if not installed we just fall back to console.
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const log = require('electron-log') as {
      transports: { file: { level: string } }
      info: (...args: unknown[]) => void
      warn: (...args: unknown[]) => void
      error: (...args: unknown[]) => void
    }

    log.transports.file.level = 'info'
    // electron-updater expects a logger-like object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(autoUpdater as any).logger = log
  } catch {
    // no-op
  }
}

function maybeOverrideFeedUrl(): void {
  const provider = process.env.UPDATER_PROVIDER

  if (!provider) {
    const url = process.env.UPDATER_URL
    if (!url) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(autoUpdater as any).setFeedURL({ provider: 'generic', url })
    return
  }

  if (provider === 'github') {
    const owner = process.env.UPDATER_GITHUB_OWNER
    const repo = process.env.UPDATER_GITHUB_REPO
    if (!owner || !repo) return
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ;(autoUpdater as any).setFeedURL({ provider: 'github', owner, repo })
  }
}

function installMenuItem(): void {
  const checkForUpdatesItem: Electron.MenuItemConstructorOptions = {
    label: 'Check for Updates…',
    click: () => {
      // Fire-and-forget; results are delivered via events.
      autoUpdater.checkForUpdates().catch(() => undefined)
    }
  }

  const template: Electron.MenuItemConstructorOptions[] = []

  if (process.platform === 'darwin') {
    template.push({
      label: app.name,
      submenu: [
        { role: 'about' },
        { type: 'separator' },
        { role: 'services' },
        { type: 'separator' },
        { role: 'hide' },
        { role: 'hideOthers' },
        { role: 'unhide' },
        { type: 'separator' },
        { role: 'quit' }
      ]
    })
  }

  template.push(
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    },
    {
      label: 'Window',
      submenu: [{ role: 'minimize' }, { role: 'close' }]
    },
    {
      role: 'help',
      submenu: [checkForUpdatesItem]
    }
  )

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

export function initAutoUpdater(mainWindow: BrowserWindow): void {
  // IPC API for renderer (register regardless of packaged/dev so UI doesn't error)
  if (!ipcRegistered) {
    ipcRegistered = true

    ipcMain.handle('updater:is-enabled', () => isUpdaterEnabled())
    ipcMain.handle('updater:get-app-version', () => app.getVersion())

    ipcMain.handle('updater:check', async () => {
      if (!isUpdaterEnabled()) return { enabled: false }
      const result = await autoUpdater.checkForUpdates()
      return { enabled: true, updateInfo: result?.updateInfo }
    })

    ipcMain.handle('updater:download', async () => {
      if (!isUpdaterEnabled()) return { enabled: false }
      await autoUpdater.downloadUpdate()
      return { enabled: true }
    })

    ipcMain.handle('updater:install', async () => {
      if (!isUpdaterEnabled()) return { enabled: false }
      autoUpdater.quitAndInstall()
      return { enabled: true }
    })
  }

  if (!isUpdaterEnabled()) {
    send(mainWindow, { type: 'status', message: 'Updater disabled (dev mode). Package the app or set FORCE_UPDATER=1.' })
    return
  }

  configureLogging()
  maybeOverrideFeedUrl()
  autoUpdater.autoDownload = false

  if (!updaterWired) {
    updaterWired = true

    installMenuItem()

    autoUpdater.on('checking-for-update', () => {
      send(mainWindow, { type: 'checking-for-update' })
    })

    autoUpdater.on('update-available', (info) => {
      send(mainWindow, { type: 'update-available', version: info?.version })
    })

    autoUpdater.on('update-not-available', (info) => {
      send(mainWindow, { type: 'update-not-available', version: info?.version })
    })

    autoUpdater.on('download-progress', (progress) => {
      send(mainWindow, {
        type: 'download-progress',
        percent: progress.percent,
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      })
    })

    autoUpdater.on('update-downloaded', (info) => {
      send(mainWindow, { type: 'update-downloaded', version: info?.version })
    })

    autoUpdater.on('error', (err) => {
      send(mainWindow, { type: 'error', message: safeErrorMessage(err) })
    })
  }

  // Kick off an update check shortly after startup (packaged by default)
  setTimeout(() => {
    autoUpdater.checkForUpdates().catch(() => undefined)
  }, 5_000)
}
