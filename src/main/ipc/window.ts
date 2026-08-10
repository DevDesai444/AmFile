import { ipcMain, BrowserWindow, dialog } from 'electron'

/**
 * Mirror of the renderer's unsaved state, pushed on every change. The close handler runs in
 * the main process and cannot await the renderer, so the flag has to already be here.
 */
let hasUnsavedChanges = false

/**
 * Channel registration is process-global and must happen exactly once — `ipcMain.handle`
 * throws if the same channel is registered twice. Keep it out of per-window setup, which
 * runs again on macOS when the dock icon re-creates a closed window.
 */
export function registerWindowIpc(): void {
  ipcMain.handle('window:setDirty', (_event, dirty: boolean) => {
    hasUnsavedChanges = Boolean(dirty)
  })

  ipcMain.handle('window:minimize', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize()
  })

  ipcMain.handle('window:maximizeToggle', (event) => {
    const w = BrowserWindow.fromWebContents(event.sender)
    if (!w) return
    if (w.isMaximized()) w.unmaximize()
    else w.maximize()
  })

  ipcMain.handle('window:close', (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close()
  })

  ipcMain.handle('window:isMaximized', (event) => {
    return BrowserWindow.fromWebContents(event.sender)?.isMaximized() ?? false
  })
}

/** Returns true when the window may close. */
function confirmClose(win: BrowserWindow): boolean {
  if (!hasUnsavedChanges) return true
  const choice = dialog.showMessageBoxSync(win, {
    type: 'warning',
    buttons: ['Cancel', 'Discard changes'],
    defaultId: 0,
    cancelId: 0,
    title: 'Unsaved changes',
    message: 'This document has unsaved changes.',
    detail: 'Closing now will discard them.'
  })
  return choice === 1
}

/** Per-window listeners. Safe to call for every window created. */
export function registerWindowHandlers(win: BrowserWindow): void {
  win.on('close', (event) => {
    if (!confirmClose(win)) {
      event.preventDefault()
      return
    }
    // Prevent a second prompt if the renderer never clears the flag before teardown.
    hasUnsavedChanges = false
  })

  win.on('maximize', () => win.webContents.send('window:maximizeChanged', true))
  win.on('unmaximize', () => win.webContents.send('window:maximizeChanged', false))
}
