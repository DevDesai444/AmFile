import { create } from 'zustand'
import type { DocumentComplianceResult, FolderComplianceResult, FolderRunUpdate } from '../../../main/services/compliance/ComplianceProvider'

interface ComplianceState {
  documentResult: DocumentComplianceResult | null
  documentLoading: boolean
  folderRun: FolderRunUpdate | null
  folderResult: FolderComplianceResult | null
  folderRunning: boolean

  checkDocument: (docId: string, docPath: string) => Promise<void>
  checkFolder: (folderId: string, folderPath: string) => Promise<void>
  applyFolderProgress: (update: FolderRunUpdate) => void
}

export const useComplianceStore = create<ComplianceState>((set) => ({
  documentResult: null,
  documentLoading: false,
  folderRun: null,
  folderResult: null,
  folderRunning: false,

  checkDocument: async (docId, docPath) => {
    if (!window.amfile) return
    set({ documentLoading: true })
    const result = await window.amfile.compliance.checkDocument(docId, docPath)
    set({ documentResult: result, documentLoading: false })
  },

  checkFolder: async (folderId, folderPath) => {
    if (!window.amfile) return
    set({ folderRunning: true, folderResult: null })
    const result = await window.amfile.compliance.checkFolder(folderId, folderPath)
    set({ folderResult: result, folderRunning: false })
  },

  applyFolderProgress: (update) => set({ folderRun: update })
}))
