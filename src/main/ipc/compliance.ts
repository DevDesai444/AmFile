import { ipcMain, BrowserWindow } from 'electron'
import { complianceProvider } from '../services/compliance/provider'

export function registerComplianceHandlers(): void {
  ipcMain.handle('compliance:checkDocument', async (_event, docId: string, docPath: string) => {
    return complianceProvider.checkDocument(docId, docPath)
  })

  ipcMain.handle('compliance:checkFolder', async (event, folderId: string, folderPath: string) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return complianceProvider.checkFolder(folderId, folderPath, (update) => {
      win?.webContents.send('compliance:folderProgress', folderId, update)
    })
  })
}
