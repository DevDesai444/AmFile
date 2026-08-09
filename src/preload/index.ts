import { contextBridge, ipcRenderer } from 'electron'
import type { AmFileDocumentModel, PageSetup } from '../main/services/docx/model'
import type { FolderRunUpdate } from '../main/services/compliance/ComplianceProvider'
import type { StreamChunk } from '../main/services/ai/AiProvider'
import type { FsTreeNode } from '../main/services/fs/tree'

const amfileApi = {
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximizeToggle: () => ipcRenderer.invoke('window:maximizeToggle'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChanged: (cb: (isMaximized: boolean) => void): (() => void) => {
      const listener = (_: unknown, v: boolean): void => cb(v)
      ipcRenderer.on('window:maximizeChanged', listener)
      return (): void => {
        ipcRenderer.removeListener('window:maximizeChanged', listener)
      }
    }
  },
  fs: {
    openFolderDialog: (): Promise<string | null> => ipcRenderer.invoke('fs:openFolderDialog'),
    readDirRecursive: (path: string): Promise<FsTreeNode> => ipcRenderer.invoke('fs:readDirRecursive', path),
    saveFileDialog: (defaultName: string): Promise<string | null> => ipcRenderer.invoke('fs:saveFileDialog', defaultName),
    openFileDialog: (): Promise<string | null> => ipcRenderer.invoke('fs:openFileDialog')
  },
  docx: {
    read: (path: string) => ipcRenderer.invoke('docx:read', path),
    write: (path: string, model: AmFileDocumentModel): Promise<boolean> => ipcRenderer.invoke('docx:write', path, model),
    createBlank: (path: string, model: AmFileDocumentModel): Promise<boolean> =>
      ipcRenderer.invoke('docx:createBlank', path, model)
  },
  print: {
    exportPdf: (outPath: string, pageSetup: PageSetup, headerHtml: string, footerHtml: string): Promise<boolean> =>
      ipcRenderer.invoke('print:exportPdf', outPath, pageSetup, headerHtml, footerHtml)
  },
  compliance: {
    checkDocument: (docId: string, docPath: string) => ipcRenderer.invoke('compliance:checkDocument', docId, docPath),
    checkFolder: (folderId: string, folderPath: string) => ipcRenderer.invoke('compliance:checkFolder', folderId, folderPath),
    onFolderProgress: (cb: (folderId: string, update: FolderRunUpdate) => void): (() => void) => {
      const listener = (_: unknown, folderId: string, update: FolderRunUpdate): void => cb(folderId, update)
      ipcRenderer.on('compliance:folderProgress', listener)
      return (): void => {
        ipcRenderer.removeListener('compliance:folderProgress', listener)
      }
    }
  },
  ai: {
    sendMessage: (threadId: string, text: string) => ipcRenderer.invoke('ai:sendMessage', threadId, text),
    onMessageChunk: (cb: (threadId: string, chunk: StreamChunk) => void): (() => void) => {
      const listener = (_: unknown, threadId: string, chunk: StreamChunk): void => cb(threadId, chunk)
      ipcRenderer.on('ai:messageChunk', listener)
      return (): void => {
        ipcRenderer.removeListener('ai:messageChunk', listener)
      }
    }
  }
}

export type AmFileApi = typeof amfileApi

contextBridge.exposeInMainWorld('amfile', amfileApi)
