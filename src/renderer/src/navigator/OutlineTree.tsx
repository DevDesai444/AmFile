import { ListTree } from 'lucide-react'
import { useOutlineStore } from '../store/outlineStore'
import { useDocumentStore } from '../store/documentStore'

export default function OutlineTree(): React.JSX.Element {
  const headings = useOutlineStore((s) => s.headings)
  const activeHeadingId = useOutlineStore((s) => s.activeHeadingId)
  const fileName = useDocumentStore((s) => s.fileName)

  if (!fileName) {
    return (
      <div className="navigator-empty">
        <p>No document open</p>
      </div>
    )
  }

  if (headings.length === 0) {
    return (
      <div className="navigator-empty">
        <p>No headings yet</p>
      </div>
    )
  }

  return (
    <div className="tree-list">
      {headings.map((h) => (
        <div
          key={h.id}
          className={`tree-row${activeHeadingId === h.id ? ' is-selected' : ''}`}
          style={{ paddingLeft: 9 + (h.level - 1) * 13 }}
        >
          <ListTree size={13} strokeWidth={1.5} className="tree-icon" />
          <span className="tree-label">{h.text || 'Untitled heading'}</span>
        </div>
      ))}
    </div>
  )
}
