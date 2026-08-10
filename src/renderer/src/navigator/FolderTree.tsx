import { useMemo, useState } from 'react'
import { ChevronRight, ChevronDown, Folder, FolderOpen, FileText, Lock, Users, FolderPlus, RefreshCw, ShieldCheck } from 'lucide-react'
import { useFolderStore, type FolderNode } from '../store/folderStore'
import { useSessionStore } from '../store/sessionStore'
import { useDocumentStore } from '../store/documentStore'
import { useUiStore } from '../store/uiStore'
import { runRibbonAction } from '../ribbon/ribbonActions'
import { askText } from '../common/promptStore'

const ACCESS_LABEL: Record<string, string> = {
  viewer: 'Read only',
  editor: 'Can edit',
  owner: 'Owner'
}

/**
 * Keeps a folder when its own name matches, or when anything beneath it does — so filtering
 * on a document name still shows the path you need to click through to reach it.
 */
function filterTree(nodes: FolderNode[], q: string): FolderNode[] {
  if (!q) return nodes
  const needle = q.toLowerCase()
  const walk = (node: FolderNode): FolderNode | null => {
    const children = node.children.map(walk).filter((n): n is FolderNode => n !== null)
    const documents = node.documents.filter(
      (d) => d.path.toLowerCase().includes(needle) || d.title.toLowerCase().includes(needle)
    )
    const selfMatches = node.name.toLowerCase().includes(needle)
    if (!selfMatches && children.length === 0 && documents.length === 0) return null
    // A matching folder keeps everything inside it; a folder kept only because of a
    // descendant shows just the matching part.
    return selfMatches ? node : { ...node, children, documents }
  }
  return nodes.map(walk).filter((n): n is FolderNode => n !== null)
}

function FolderRow({ node, depth, forceOpen }: { node: FolderNode; depth: number; forceOpen: boolean }): React.JSX.Element {
  const expanded = useFolderStore((s) => s.expanded)
  const toggle = useFolderStore((s) => s.toggle)
  const openPermissions = useFolderStore((s) => s.openPermissions)
  const selectFolder = useFolderStore((s) => s.selectFolder)
  const selectedFolder = useFolderStore((s) => s.selectedFolder)
  const createFolder = useFolderStore((s) => s.createFolder)
  const createDocument = useFolderStore((s) => s.createDocument)
  const me = useSessionStore((s) => s.user)
  const openDocumentId = useDocumentStore((s) => s.documentId)
  const requestOpenServerDoc = useDocumentStore((s) => s.requestOpenServerDoc)
  const dirty = useDocumentStore((s) => s.dirty)
  const setView = useUiStore((s) => s.setView)

  // While a filter is active every surviving branch is shown expanded, otherwise the
  // matches stay hidden behind collapsed folders and the filter looks broken.
  const isOpen = forceOpen || expanded.has(node.id)
  const canEdit = node.access === 'editor' || node.access === 'owner'

  return (
    <>
      <div
        className={`tree-row tree-row--folder${selectedFolder?.id === node.id ? ' is-selected' : ''}`}
        style={{ paddingLeft: 9 + depth * 13 }}
        onClick={() => selectFolder(node.id, node.name)}
      >
        <button
          type="button"
          className="tree-caret-btn"
          onClick={(e) => {
            e.stopPropagation()
            toggle(node.id)
          }}
        >
          {isOpen ? <ChevronDown size={11} strokeWidth={1.5} /> : <ChevronRight size={11} strokeWidth={1.5} />}
        </button>
        {isOpen ? (
          <FolderOpen size={13} strokeWidth={1.5} className="tree-icon" />
        ) : (
          <Folder size={13} strokeWidth={1.5} className="tree-icon" />
        )}
        <span className="tree-label" title={node.name}>
          {node.name}
        </span>
        <span className={`tree-access tree-access--${node.access}`} title={`Your access: ${ACCESS_LABEL[node.access]}`}>
          {ACCESS_LABEL[node.access]}
        </span>
        <button
          type="button"
          className="tree-mini-btn"
          title={`Run a compliance check across “${node.name}”`}
          onClick={(e) => {
            e.stopPropagation()
            selectFolder(node.id, node.name)
            void runRibbonAction('compliance.checkFolder')
          }}
        >
          <ShieldCheck size={11} strokeWidth={1.5} />
        </button>
        {node.access === 'owner' && (
          <button
            type="button"
            className="tree-mini-btn"
            title="Manage who can access this folder"
            onClick={(e) => {
              e.stopPropagation()
              openPermissions(node.id, node.name)
            }}
          >
            <Users size={11} strokeWidth={1.5} />
          </button>
        )}
        {canEdit && (
          <>
            <button
              type="button"
              className="tree-mini-btn"
              title="New sub-folder"
              onClick={async (e) => {
                e.stopPropagation()
                const name = await askText(`New folder inside “${node.name}”`, '', { confirmLabel: 'Create' })
                if (name?.trim()) await createFolder(name.trim(), node.id)
              }}
            >
              <FolderPlus size={11} strokeWidth={1.5} />
            </button>
            <button
              type="button"
              className="tree-mini-btn"
              title="New document in this folder"
              onClick={async (e) => {
                e.stopPropagation()
                const name = await askText(`New document in “${node.name}”`, '', { confirmLabel: 'Create' })
                if (name?.trim()) await createDocument(name.trim(), node.id)
              }}
            >
              <FileText size={11} strokeWidth={1.5} />
            </button>
          </>
        )}
      </div>

      {isOpen && (
        <>
          {node.children.map((c) => (
            <FolderRow key={c.id} node={c} depth={depth + 1} forceOpen={forceOpen} />
          ))}
          {node.documents.map((d) => {
            const lockedByOther = d.lockedBy && d.lockedBy.userId !== me?.id
            return (
              <div
                key={d.id}
                className={`tree-row${openDocumentId === d.id ? ' is-selected' : ''}`}
                style={{ paddingLeft: 9 + (depth + 1) * 13 }}
                title={d.lockedBy ? `Checked out by ${d.lockedBy.displayName}` : d.path}
                onClick={() => {
                  if (dirty && !window.confirm('You have unsaved changes. Discard them and open this document?')) return
                  setView('editor')
                  requestOpenServerDoc(d.id)
                }}
              >
                <span className="tree-caret-spacer" />
                <FileText size={13} strokeWidth={1.5} className="tree-icon" />
                <span className="tree-label">{d.path}</span>
                <span className="tree-rev">v{d.currentRevision}</span>
                {d.lockedBy && (
                  <Lock
                    size={11}
                    strokeWidth={1.5}
                    className={lockedByOther ? 'tree-lock tree-lock--other' : 'tree-lock tree-lock--mine'}
                  />
                )}
              </div>
            )
          })}
        </>
      )}
    </>
  )
}

export default function FolderTree(): React.JSX.Element {
  const folders = useFolderStore((s) => s.folders)
  const loading = useFolderStore((s) => s.loading)
  const error = useFolderStore((s) => s.error)
  const refresh = useFolderStore((s) => s.refresh)
  const createFolder = useFolderStore((s) => s.createFolder)
  const navFilter = useUiStore((s) => s.navFilter)
  const [busy, setBusy] = useState(false)

  const visible = useMemo(() => filterTree(folders, navFilter.trim()), [folders, navFilter])

  if (error) {
    return (
      <div className="navigator-empty">
        <p>{error}</p>
        <button type="button" onClick={() => void refresh()}>
          Retry
        </button>
      </div>
    )
  }

  if (loading && folders.length === 0) return <div className="navigator-empty">Loading…</div>

  return (
    <div className="tree-list">
      {folders.length === 0 && (
        <div className="navigator-empty">
          <p>No folders you can access.</p>
          <p className="navigator-empty-hint">Start one below, or ask an owner to add your email address.</p>
        </div>
      )}
      {folders.length > 0 && visible.length === 0 && (
        <div className="navigator-empty">
          <p>Nothing matches “{navFilter.trim()}”.</p>
        </div>
      )}
      {visible.map((f) => (
        <FolderRow key={f.id} node={f} depth={0} forceOpen={navFilter.trim().length > 0} />
      ))}

      <div className="tree-actions">
        <button
          type="button"
          className="tree-refresh"
          disabled={busy}
          onClick={async () => {
            const name = await askText('Name your new project', '', {
              hint: 'You will own it, and decide who else gets in.',
              confirmLabel: 'Create'
            })
            if (!name?.trim()) return
            setBusy(true)
            await createFolder(name.trim(), null)
            setBusy(false)
          }}
        >
          <FolderPlus size={11} strokeWidth={1.5} />
          New project
        </button>
        <button type="button" className="tree-refresh" onClick={() => void refresh()}>
          <RefreshCw size={11} strokeWidth={1.5} />
          Refresh
        </button>
      </div>
    </div>
  )
}
