export type Severity = 'high' | 'medium' | 'low'
export type ConfidenceTier = 'verified' | 'corroborated' | 'advisory'

export interface Finding {
  id: string
  severity: Severity
  tier: ConfidenceTier
  title: string
  detail: string
  ruleId: string
  location: string
  detectionMethod: 'code-verified' | 'quote-anchored' | 'model-judgment'
  precedentCount: number
}

export interface DocumentComplianceResult {
  docId: string
  findings: Finding[]
  severityCounts: Record<Severity, number>
  analysedInSeconds: number
}

export type RunRowState = 'queued' | 'parsing' | 'detecting' | 'clear' | 'findings' | 'error'

export interface FolderRunRow {
  docCode: string
  docName: string
  state: RunRowState
  severityCounts: Record<Severity, number>
}

export interface CrossDocIssue {
  id: string
  title: string
  comparisons: Array<{ docCode: string; value: string }>
}

export interface AgentLogLine {
  agent: string
  message: string
  timestamp: string
}

export interface FolderRunUpdate {
  rows: FolderRunRow[]
  elapsedSeconds: number
  documentsComplete: number
  documentsTotal: number
  agentLog: AgentLogLine[]
}

export interface FolderComplianceResult extends FolderRunUpdate {
  crossDoc: CrossDocIssue[]
  highTotal: number
  mediumTotal: number
}

export interface ComplianceProvider {
  checkDocument(docId: string, docPath: string): Promise<DocumentComplianceResult>
  checkFolder(
    folderId: string,
    folderPath: string,
    onProgress: (update: FolderRunUpdate) => void
  ): Promise<FolderComplianceResult>
}
