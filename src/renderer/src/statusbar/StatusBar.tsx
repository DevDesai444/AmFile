import { Circle } from 'lucide-react'
import { useDocumentStore } from '../store/documentStore'
import { useComplianceStore } from '../store/complianceStore'
import { useEditorStatsStore } from '../store/editorStatsStore'

export default function StatusBar(): React.JSX.Element {
  const zoom = useDocumentStore((s) => s.zoom)
  const trackChangesEnabled = useDocumentStore((s) => s.trackChangesEnabled)
  const documentResult = useComplianceStore((s) => s.documentResult)
  const { wordCount, page, totalPages } = useEditorStatsStore()

  const findingsTotal = documentResult
    ? documentResult.severityCounts.high + documentResult.severityCounts.medium + documentResult.severityCounts.low
    : null

  return (
    <div className="statusbar">
      <span>
        Page {page} of {totalPages}
      </span>
      <span className="statusbar-divider" />
      <span>{wordCount} words</span>
      <span className="statusbar-divider" />
      <span>English (US)</span>
      <span className="statusbar-divider" />
      <span className="statusbar-track">
        <Circle size={7} fill={trackChangesEnabled ? '#c98b6b' : 'transparent'} stroke="currentColor" strokeWidth={1.5} />
        Track changes {trackChangesEnabled ? 'on' : 'off'}
      </span>
      {findingsTotal !== null && (
        <>
          <span className="statusbar-divider" />
          <span>{findingsTotal} findings</span>
        </>
      )}
      <span className="statusbar-spacer" />
      <span>Print layout</span>
      <span className="statusbar-divider" />
      <div className="statusbar-zoom">
        <div className="statusbar-zoom-track">
          <div className="statusbar-zoom-fill" style={{ width: `${zoom}%` }} />
        </div>
        <span>{zoom}%</span>
      </div>
    </div>
  )
}
