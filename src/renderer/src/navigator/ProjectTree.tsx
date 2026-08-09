import { Folder, ChevronRight, ChevronDown, FileText, File as FileIcon, FolderOpen } from 'lucide-react'
import { useTreeStore } from '../store/treeStore'
import type { FsTreeNode } from '../store/treeStore'
import { useUiStore } from '../store/uiStore'
import { useDocumentStore } from '../store/documentStore'
import { runRibbonAction } from '../ribbon/ribbonActions'

interface FlatRow {
  node: FsTreeNode
  depth: number
}

function flatten(node: FsTreeNode, depth: number, openFolders: Set<string>, out: FlatRow[]): void {
  out.push({ node, depth })
  if (node.type === 'folder' && openFolders.has(node.path) && node.children) {
    for (const child of node.children) flatten(child, depth + 1, openFolders, out)
  }
}

export default function ProjectTree(): React.JSX.Element {
  const root = useTreeStore((s) => s.root)
  const openFolders = useTreeStore((s) => s.openFolders)
  const toggleFolder = useTreeStore((s) => s.toggleFolder)
  const loading = useTreeStore((s) => s.loading)
  const selectedTreePath = useUiStore((s) => s.selectedTreePath)
  const setSelectedTreePath = useUiStore((s) => s.setSelectedTreePath)
  const setView = useUiStore((s) => s.setView)
  const requestOpen = useDocumentStore((s) => s.requestOpen)

  if (loading) return <div className="navigator-empty">Reading folder…</div>

  if (!root) {
    return (
      <div className="navigator-empty">
        <p>No folder open</p>
        <button type="button" onClick={() => runRibbonAction('folder.open')}>
          Open folder
        </button>
      </div>
    )
  }

  const rows: FlatRow[] = []
  flatten(root, 0, openFolders, rows)

  return (
    <div className="tree-list">
      {rows.map(({ node, depth }) => {
        const isFolder = node.type === 'folder'
        const isOpen = openFolders.has(node.path)
        const isSelected = selectedTreePath === node.path
        const Icon = isFolder ? (isOpen ? FolderOpen : Folder) : node.type === 'docx' ? FileText : FileIcon

        return (
          <div
            key={node.path}
            className={`tree-row${isSelected ? ' is-selected' : ''}`}
            style={{ paddingLeft: 9 + depth * 13 }}
            onClick={() => {
              setSelectedTreePath(node.path)
              if (isFolder) {
                toggleFolder(node.path)
                return
              }
              setView('editor')
              if (node.type === 'docx') requestOpen(node.path)
            }}
          >
            {isFolder ? (
              isOpen ? (
                <ChevronDown size={11} strokeWidth={1.5} className="tree-caret" />
              ) : (
                <ChevronRight size={11} strokeWidth={1.5} className="tree-caret" />
              )
            ) : (
              <span className="tree-caret-spacer" />
            )}
            <Icon size={13} strokeWidth={1.5} className="tree-icon" />
            <span className="tree-label">{node.name}</span>
          </div>
        )
      })}
    </div>
  )
}
