import { ipcMain, BrowserWindow } from 'electron'

export function registerWindowHandlers(win: BrowserWindow): void {
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

  win.on('maximize', () => win.webContents.send('window:maximizeChanged', true))
  win.on('unmaximize', () => win.webContents.send('window:maximizeChanged', false))
}
