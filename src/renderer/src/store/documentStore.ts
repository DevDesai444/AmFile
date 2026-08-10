import { create } from 'zustand'
import type { JSONContent } from '@tiptap/core'

export interface PageSetup {
  size: 'A4' | 'Letter'
  orientation: 'portrait' | 'landscape'
  marginTopMm: number
  marginBottomMm: number
  marginLeftMm: number
  marginRightMm: number
  columns: number
}

export const DEFAULT_PAGE_SETUP: PageSetup = {
  size: 'A4',
  orientation: 'portrait',
  marginTopMm: 25.4,
  marginBottomMm: 25.4,
  marginLeftMm: 25.4,
  marginRightMm: 25.4,
  columns: 1
}

interface DocumentState {
  filePath: string | null
  fileName: string | null
  dirty: boolean
  savedAt: string | null
  pageSetup: PageSetup
  trackChangesEnabled: boolean
  zoom: number
  pendingOpenPath: string | null
  headerText: string
  footerText: string
  /** Bumped whenever a blank document is started. EditorCanvas watches it and clears the
   *  editor — without this, `File → New` keeps the previous document's body, because
   *  setContent is otherwise only called on the open-from-disk path. */
  resetToken: number

  openDocument: (filePath: string, fileName: string, pageSetup?: PageSetup) => void
  newDocument: (fileName: string) => void
  markDirty: () => void
  markSaved: () => void
  setPageSetup: (pageSetup: PageSetup) => void
  toggleTrackChanges: () => void
  setZoom: (zoom: number) => void
  requestOpen: (path: string) => void
  clearPendingOpen: () => void
  setHeaderText: (text: string) => void
  setFooterText: (text: string) => void
  cycleOrientation: () => void
  cycleMargins: () => void
}

const MARGIN_PRESETS: Array<{ name: string; mm: number }> = [
  { name: 'Normal', mm: 25.4 },
  { name: 'Narrow', mm: 12.7 },
  { name: 'Wide', mm: 38.1 }
]

function formatSavedTime(date: Date): string {
  return date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
}

export const useDocumentStore = create<DocumentState>((set) => ({
  filePath: null,
  fileName: null,
  dirty: false,
  savedAt: null,
  pageSetup: DEFAULT_PAGE_SETUP,
  trackChangesEnabled: false,
  zoom: 100,
  pendingOpenPath: null,
  headerText: '',
  footerText: '',
  resetToken: 0,

  openDocument: (filePath, fileName, pageSetup) =>
    set({ filePath, fileName, dirty: false, savedAt: formatSavedTime(new Date()), pageSetup: pageSetup ?? DEFAULT_PAGE_SETUP }),
  newDocument: (fileName) =>
    set((s) => ({
      filePath: null,
      fileName,
      dirty: false,
      savedAt: null,
      pageSetup: DEFAULT_PAGE_SETUP,
      // Header/footer are per-document; leaving them set would write the previous
      // document's running head into the new file.
      headerText: '',
      footerText: '',
      resetToken: s.resetToken + 1
    })),
  markDirty: () => set({ dirty: true }),
  markSaved: () => set({ dirty: false, savedAt: formatSavedTime(new Date()) }),
  setPageSetup: (pageSetup) => set({ pageSetup, dirty: true }),
  toggleTrackChanges: () => set((s) => ({ trackChangesEnabled: !s.trackChangesEnabled })),
  setZoom: (zoom) => set({ zoom }),
  requestOpen: (path) => set({ pendingOpenPath: path }),
  clearPendingOpen: () => set({ pendingOpenPath: null }),
  setHeaderText: (headerText) => set({ headerText, dirty: true }),
  setFooterText: (footerText) => set({ footerText, dirty: true }),
  cycleOrientation: () =>
    set((s) => ({
      pageSetup: {
        ...s.pageSetup,
        orientation: s.pageSetup.orientation === 'portrait' ? 'landscape' : 'portrait'
      },
      dirty: true
    })),
  cycleMargins: () =>
    set((s) => {
      const idx = MARGIN_PRESETS.findIndex((p) => p.mm === s.pageSetup.marginTopMm)
      const next = MARGIN_PRESETS[(idx + 1) % MARGIN_PRESETS.length]
      return {
        pageSetup: {
          ...s.pageSetup,
          marginTopMm: next.mm,
          marginBottomMm: next.mm,
          marginLeftMm: next.mm,
          marginRightMm: next.mm
        },
        dirty: true
      }
    })
}))

export type { JSONContent }
