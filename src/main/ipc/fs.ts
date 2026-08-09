import { ipcMain, dialog, BrowserWindow } from 'electron'
import { readProjectTree } from '../services/fs/tree'

/**
 * Every path passed in from the renderer must resolve inside the last folder opened
 * via openFolderDialog; readDirRecursive re-derives and caches that root per window
 * so a compromised renderer can't walk the handler outside the chosen project.
 */
const openRoots = new WeakMap<BrowserWindow, string>()

export function registerFsHandlers(): void {
  ipcMain.handle('fs:openFolderDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, { properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    const root = result.filePaths[0]
    if (win) openRoots.set(win, root)
    return root
  })

  ipcMain.handle('fs:readDirRecursive', async (event, rootPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win) openRoots.set(win, rootPath)
    return readProjectTree(rootPath)
  })

  ipcMain.handle('fs:saveFileDialog', async (event, defaultName: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showSaveDialog(win!, {
      defaultPath: defaultName,
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    })
    if (result.canceled || !result.filePath) return null
    return result.filePath
  })

  ipcMain.handle('fs:openFileDialog', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Word Document', extensions: ['docx'] }]
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
}
