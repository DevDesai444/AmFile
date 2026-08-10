import { useEffect } from 'react'
import { useComplianceStore } from '../store/complianceStore'
import { useDocumentStore } from '../store/documentStore'
import { useUiStore } from '../store/uiStore'
import type { Severity } from '../../../main/services/compliance/ComplianceProvider'

const SEVERITY_LABEL: Record<Severity, string> = { high: 'high', medium: 'medium', low: 'low' }

export default function CompliancePanel(): React.JSX.Element {
  const filePath = useDocumentStore((s) => s.filePath)
  const fileName = useDocumentStore((s) => s.fileName)
  const documentResult = useComplianceStore((s) => s.documentResult)
  const documentLoading = useComplianceStore((s) => s.documentLoading)
  const checkDocument = useComplianceStore((s) => s.checkDocument)
  const activeFindingId = useUiStore((s) => s.activeFindingId)
  const setActiveFinding = useUiStore((s) => s.setActiveFinding)

  useEffect(() => {
    if (fileName && !documentResult && !documentLoading) {
      checkDocument(filePath ?? fileName, filePath ?? fileName)
    }
  }, [fileName, filePath, documentResult, documentLoading, checkDocument])

  if (!fileName) {
    return <div className="navigator-empty">No document open</div>
  }

  if (documentLoading || !documentResult) {
    return <div className="navigator-empty">Analysing…</div>
  }

  const { severityCounts, findings, analysedInSeconds } = documentResult
  const total = severityCounts.high + severityCounts.medium + severityCounts.low

  return (
    <div className="compliance-panel">
      {/* These findings come from StubComplianceProvider, not from any real analysis. The rule
          IDs and severities look authoritative, so the panel must say so in-place — a label
          buried in Settings is not enough to stop someone acting on invented findings. */}
      <div className="stub-banner">
        <strong>Example data.</strong> No compliance engine is connected — these findings are
        placeholders and must not be used to assess a document.
      </div>
      <div className="compliance-summary">
        <span className="compliance-summary-count">{total}</span>
        <span>findings in this document</span>
      </div>
      <div className="compliance-severity-bar">
        <div style={{ flex: severityCounts.high || 0.0001 }} className="sev-hi" />
        <div style={{ flex: severityCounts.medium || 0.0001 }} className="sev-med" />
        <div style={{ flex: severityCounts.low || 0.0001 }} className="sev-low" />
      </div>
      <div className="compliance-legend">
        {severityCounts.high} high · {severityCounts.medium} medium · {severityCounts.low} low
        <span className="compliance-analysed"> · Analysed in {analysedInSeconds.toFixed(1)}s</span>
      </div>

      <div className="compliance-findings">
        {findings.map((f) => (
          <div
            key={f.id}
            className={`compliance-finding${activeFindingId === f.id ? ' is-active' : ''}`}
            onClick={() => setActiveFinding(f.id)}
          >
            <div className="compliance-finding-head">
              <span className={`sev-dot sev-dot--${f.severity}`} />
              <span className={`compliance-sev-label sev-text--${f.severity}`}>{SEVERITY_LABEL[f.severity]}</span>
              <span className="compliance-tier-pill">{f.tier}</span>
              <span className="compliance-finding-loc">{f.location}</span>
            </div>
            <div className="compliance-finding-title">{f.title}</div>
            <div className="compliance-finding-detail">{f.detail}</div>
            <div className="compliance-finding-source">
              rule {f.ruleId} · {f.detectionMethod} · {f.precedentCount} precedents
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
