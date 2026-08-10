import { ChevronRight, Plus, PanelLeftClose, Search, ShieldCheck } from 'lucide-react'
import { useUiStore } from '../store/uiStore'
import { useTreeStore } from '../store/treeStore'
import ServerDocTree from './ServerDocTree'
import OutlineTree from './OutlineTree'
import { runRibbonAction } from '../ribbon/ribbonActions'

export default function Navigator(): React.JSX.Element {
  const leftOpen = useUiStore((s) => s.leftOpen)
  const toggleLeft = useUiStore((s) => s.toggleLeft)
  const treeTab = useUiStore((s) => s.treeTab)
  const setTreeTab = useUiStore((s) => s.setTreeTab)
  const rootPath = useTreeStore((s) => s.rootPath)

  if (!leftOpen) {
    return (
      <div className="navigator navigator--collapsed">
        <button type="button" className="navigator-expand-btn" onClick={toggleLeft} aria-label="Expand navigator">
          <ChevronRight size={13} strokeWidth={1.5} />
        </button>
        <span className="navigator-collapsed-label">Navigator</span>
      </div>
    )
  }

  return (
    <div className="navigator">
      <div className="navigator-header">
        <div className="navigator-tabtoggle">
          <button
            type="button"
            className={treeTab === 'project' ? 'is-active' : ''}
            onClick={() => setTreeTab('project')}
          >
            Project
          </button>
          <button
            type="button"
            className={treeTab === 'outline' ? 'is-active' : ''}
            onClick={() => setTreeTab('outline')}
          >
            Outline
          </button>
        </div>
        <div className="navigator-header-spacer" />
        <button type="button" aria-label="New document" onClick={() => runRibbonAction('file.new')}>
          <Plus size={13} strokeWidth={1.5} />
        </button>
        <button type="button" aria-label="Collapse navigator" onClick={toggleLeft}>
          <PanelLeftClose size={13} strokeWidth={1.5} />
        </button>
      </div>

      <div className="navigator-filter">
        <Search size={12} strokeWidth={1.5} />
        <span>Filter files and sections</span>
      </div>

      <div className="navigator-body">
        {treeTab === 'project' ? <ServerDocTree /> : <OutlineTree />}
      </div>

      {rootPath && (
        <div className="navigator-footer">
          <button type="button" className="navigator-check-folder-btn" onClick={() => runRibbonAction('compliance.checkFolder')}>
            <ShieldCheck size={14} strokeWidth={1.5} />
            Check entire folder
          </button>
        </div>
      )}
    </div>
  )
}
