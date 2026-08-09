import { create } from 'zustand'

export type ViewMode = 'welcome' | 'editor' | 'folder' | 'settings'
export type DockTab = 'chat' | 'compliance' | 'comments'
export type TreeTab = 'project' | 'outline'
export type RibbonTabId =
  | 'File'
  | 'Home'
  | 'Insert'
  | 'Design'
  | 'Layout'
  | 'References'
  | 'Mailings'
  | 'Review'
  | 'View'
  | 'Compliance'

interface UiState {
  ribbonOpen: boolean
  leftOpen: boolean
  dockOpen: boolean
  view: ViewMode
  dock: DockTab
  treeTab: TreeTab
  activeRibbonTab: RibbonTabId
  activeFindingId: string | null
  selectedTreePath: string | null

  toggleRibbon: () => void
  toggleLeft: () => void
  toggleDock: () => void
  setView: (view: ViewMode) => void
  setDock: (dock: DockTab, opts?: { open?: boolean }) => void
  setTreeTab: (tab: TreeTab) => void
  setActiveRibbonTab: (tab: RibbonTabId) => void
  setActiveFinding: (id: string | null) => void
  setSelectedTreePath: (path: string | null) => void
}

export const useUiStore = create<UiState>((set) => ({
  ribbonOpen: true,
  leftOpen: true,
  dockOpen: true,
  view: 'welcome',
  dock: 'chat',
  treeTab: 'project',
  activeRibbonTab: 'Home',
  activeFindingId: null,
  selectedTreePath: null,

  toggleRibbon: () => set((s) => ({ ribbonOpen: !s.ribbonOpen })),
  toggleLeft: () => set((s) => ({ leftOpen: !s.leftOpen })),
  toggleDock: () => set((s) => ({ dockOpen: !s.dockOpen })),
  setView: (view) => set({ view }),
  setDock: (dock, opts) => set({ dock, ...(opts?.open ? { dockOpen: true } : {}) }),
  setTreeTab: (treeTab) => set({ treeTab }),
  setActiveRibbonTab: (activeRibbonTab) => set({ activeRibbonTab }),
  setActiveFinding: (activeFindingId) => set({ activeFindingId }),
  setSelectedTreePath: (selectedTreePath) => set({ selectedTreePath })
}))
