/**
 * Thin HTTP/WebSocket client for the AmFile server. Lives in the renderer rather than the
 * main process because it needs no Node APIs — and keeping it here means the login screen,
 * document list and editor all share one session token without extra IPC hops.
 */

/**
 * host:port of the AmFile server. Comes from VITE_AMFILE_HOST (see .env) so the same value
 * feeds both this client and the Content-Security-Policy in index.html — if they disagree,
 * the CSP silently blocks every request and it looks like the server is down.
 */
const SERVER_HOST = import.meta.env.VITE_AMFILE_HOST ?? '127.0.0.1:8787'
const BASE = `http://${SERVER_HOST}`
const TOKEN_KEY = 'amfile.session'

export interface ApiUser {
  id: string
  email: string
  displayName: string
  roles: Array<'author' | 'reviewer' | 'approver' | 'admin'>
  mustChangePassword: boolean
}

export interface AdminUser {
  id: string
  email: string
  displayName: string
  roles: ApiUser['roles']
  active: boolean
  lastSeenAt: string | null
  mustChangePassword: boolean
  lockedUntil: string | null
  passwordUpdatedAt: string | null
}

export interface ApiDocument {
  id: string
  path: string
  title: string
  currentRevision: number
  updatedAt: string | null
  lockedBy: { userId: string; displayName: string; expiresAt: string } | null
}

export interface ApiRevision {
  documentId: string
  revision: number
  content: unknown
  pageSetup: unknown
  header: unknown
  footer: unknown
  contentHash: string
  authorName: string
  createdAt: string
}

export interface ApiFolderNode {
  id: string
  name: string
  parentId: string | null
  access: 'viewer' | 'editor' | 'owner'
  children: ApiFolderNode[]
  documents: Array<{
    id: string
    path: string
    title: string
    currentRevision: number
    updatedAt: string | null
    lockedBy: { userId: string; displayName: string } | null
  }>
}

export interface FolderMember {
  userId: string
  displayName: string
  email: string
  access: 'viewer' | 'editor' | 'owner'
  /** True when the access comes from a parent folder rather than a grant on this one. */
  inherited: boolean
}

export interface DirectoryUser {
  id: string
  displayName: string
  email: string
}

export interface Proposal {
  id: string
  documentId: string
  authorId: string
  authorName: string
  baseRevision: number
  summary: string | null
  status: 'open' | 'accepted' | 'closed'
  createdAt: string
  updatedAt: string
  resolvedByName: string | null
  resultingRevision: number | null
  /** The document has moved on since this was written. */
  stale: boolean
  commentCount: number
}

export interface WordChange {
  kind: 'unchanged' | 'added' | 'removed'
  text: string
}

export interface ProposalReview {
  proposal: Proposal
  diff: {
    blocks: Array<{ status: 'unchanged' | 'added' | 'removed' | 'modified'; blockType: string; words: WordChange[]; text: string }>
    summary: { added: number; removed: number; modified: number; wordsAdded: number; wordsRemoved: number }
  }
  /** Present only when the proposal is stale and no longer applies cleanly. */
  conflicts: Array<{ blockIndex: number; base: string; ours: string; theirs: string }> | null
}

export interface ProposalComment {
  id: string
  authorName: string
  body: string
  createdAt: string
}

export interface AuditEntry {
  id: string
  occurred_at: string
  printed_name: string
  action: string
  document_id: string | null
  revision_before: number | null
  revision_after: number | null
  reason: string | null
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown
  ) {
    super(message)
  }
}

let token: string | null = localStorage.getItem(TOKEN_KEY)

export function getToken(): string | null {
  return token
}

export function setToken(next: string | null): void {
  token = next
  if (next) localStorage.setItem(TOKEN_KEY, next)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        // Only declare a JSON body when there actually is one — Fastify rejects an empty
        // body sent with application/json as a 400, which made lock/heartbeat calls look
        // like permission failures.
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init.headers ?? {})
      }
    })
  } catch {
    // Distinguish "server is down" from "server said no" — the UI shows very different
    // things for each, and conflating them makes an outage look like a permissions problem.
    throw new ApiError('Cannot reach the AmFile server. Is it running?', 0, null)
  }

  const text = await res.text()
  const body = text ? (JSON.parse(text) as unknown) : null
  if (!res.ok) {
    const message =
      (body as { error?: string; lockedBy?: string } | null)?.error ??
      (body as { code?: string } | null)?.code ??
      `Request failed (${res.status})`
    throw new ApiError(message, res.status, body)
  }
  return body as T
}

export const api = {
  async login(email: string, password: string): Promise<{ user: ApiUser; passwordExpired: boolean }> {
    const res = await request<{ token: string; user: ApiUser; passwordExpired: boolean }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    })
    setToken(res.token)
    return { user: res.user, passwordExpired: res.passwordExpired }
  },

  async logout(): Promise<void> {
    try {
      await request('/api/auth/logout', { method: 'POST' })
    } finally {
      setToken(null)
    }
  },

  me: () => request<{ user: ApiUser }>('/api/auth/me'),

  changePassword: (current: string, next: string) =>
    request<{ ok: true }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ current, next })
    }),

  listUsers: () => request<{ users: AdminUser[] }>('/api/users'),

  inviteUser: (email: string, displayName: string, roles: ApiUser['roles']) =>
    request<{ ok: true; user: AdminUser; temporaryPassword: string }>('/api/users/invite', {
      method: 'POST',
      body: JSON.stringify({ email, displayName, roles })
    }),

  setUserActive: (id: string, active: boolean) =>
    request<{ ok: true }>(`/api/users/${id}/active`, { method: 'POST', body: JSON.stringify({ active }) }),

  setUserRoles: (id: string, roles: ApiUser['roles']) =>
    request<{ ok: true }>(`/api/users/${id}/roles`, { method: 'POST', body: JSON.stringify({ roles }) }),

  resetUserPassword: (id: string) =>
    request<{ temporaryPassword: string }>(`/api/users/${id}/reset-password`, { method: 'POST' }),

  listProposals: (documentId: string) =>
    request<{ proposals: Proposal[] }>(`/api/documents/${documentId}/proposals`),

  saveProposal: (documentId: string, content: unknown, summary: string | null) =>
    request<{ id: string; created: boolean }>(`/api/documents/${documentId}/proposals`, {
      method: 'POST',
      body: JSON.stringify({ content, summary })
    }),

  reviewProposal: (id: string) => request<ProposalReview>(`/api/proposals/${id}/review`),

  acceptProposal: (id: string, reason: string | null) =>
    request<{ ok: true; revision: number }>(`/api/proposals/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ reason })
    }),

  closeProposal: (id: string, reason: string | null) =>
    request<{ ok: true }>(`/api/proposals/${id}/close`, { method: 'POST', body: JSON.stringify({ reason }) }),

  proposalComments: (id: string) => request<{ comments: ProposalComment[] }>(`/api/proposals/${id}/comments`),

  addProposalComment: (id: string, body: string) =>
    request<{ ok: true }>(`/api/proposals/${id}/comments`, { method: 'POST', body: JSON.stringify({ body }) }),

  listFolders: () => request<{ folders: ApiFolderNode[] }>('/api/folders'),

  createFolder: (name: string, parentId: string | null) =>
    request<{ id: string }>('/api/folders', { method: 'POST', body: JSON.stringify({ name, parentId }) }),

  folderMembers: (folderId: string) => request<{ members: FolderMember[] }>(`/api/folders/${folderId}/members`),

  setFolderAccess: (folderId: string, userId: string, access: 'viewer' | 'editor' | 'owner' | null) =>
    request<{ ok: true }>(`/api/folders/${folderId}/members`, {
      method: 'POST',
      body: JSON.stringify({ userId, access })
    }),

  userDirectory: () => request<{ users: DirectoryUser[] }>('/api/users/directory'),

  listDocuments: () => request<{ documents: ApiDocument[] }>('/api/documents'),

  createDocument: (path: string, title: string, folderId: string) =>
    request<{ document: ApiDocument }>('/api/documents', {
      method: 'POST',
      body: JSON.stringify({ path, title, folderId })
    }),

  getDocument: (id: string, revision?: number) =>
    request<{ document: ApiRevision }>(`/api/documents/${id}${revision ? `?revision=${revision}` : ''}`),

  history: (id: string) =>
    request<{ history: Array<{ revision: number; authorName: string; createdAt: string; contentHash: string }> }>(
      `/api/documents/${id}/history`
    ),

  save: (
    id: string,
    baseRevision: number,
    payload: { content: unknown; pageSetup: unknown; header: unknown; footer: unknown; reason?: string }
  ) =>
    request<{ ok: true; revision: number }>(`/api/documents/${id}/save`, {
      method: 'POST',
      body: JSON.stringify({ baseRevision, ...payload })
    }),

  lock: (id: string) => request<{ ok: true; expiresAt: string }>(`/api/documents/${id}/lock`, { method: 'POST' }),

  unlock: (id: string, force = false) =>
    request<{ ok: true }>(`/api/documents/${id}/unlock`, { method: 'POST', body: JSON.stringify({ force }) }),

  heartbeat: (id: string) => request<{ held: boolean }>(`/api/documents/${id}/heartbeat`, { method: 'POST' }),

  listComments: (documentId: string) =>
    request<{
      comments: Array<{
        id: string
        markId: string
        quotedText: string
        body: string
        authorName: string
        createdAt: string
        resolvedAt: string | null
      }>
    }>(`/api/documents/${documentId}/comments`),

  addComment: (documentId: string, markId: string, quotedText: string, body: string) =>
    request<{ ok: true }>(`/api/documents/${documentId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ markId, quotedText, body })
    }),

  resolveComment: (documentId: string, markId: string) =>
    request<{ ok: true }>(`/api/documents/${documentId}/comments/${markId}/resolve`, { method: 'POST' }),

  deleteComment: (documentId: string, markId: string) =>
    request<{ ok: true }>(`/api/documents/${documentId}/comments/${markId}`, { method: 'DELETE' }),

  audit: (documentId?: string) =>
    request<{ entries: AuditEntry[] }>(`/api/audit${documentId ? `?documentId=${documentId}` : ''}`),

  verifyAudit: () =>
    request<{ ok: boolean; checked: number; brokenAtId: number | null; detail: string }>('/api/audit/verify')
}

export type ServerEvent =
  | { event: 'document:updated'; payload: { documentId: string; revision: number; savedBy: string; savedByUserId: string; savedAt: string } }
  | { event: 'lock:changed'; payload: { documentId: string; lockedBy: string | null; lockedByUserId: string | null } }
  | { event: 'presence:changed'; payload: { userId: string; displayName: string; online: boolean } }
  | { event: 'documents:changed'; payload: { reason: string; documentId: string } }

/** Auto-reconnecting event stream. Returns a disposer. */
export function connectEvents(onEvent: (e: ServerEvent) => void, onStatus: (online: boolean) => void): () => void {
  let socket: WebSocket | null = null
  let closed = false
  let retry: ReturnType<typeof setTimeout> | null = null

  const open = (): void => {
    if (closed || !token) return
    const url = `${BASE.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}`
    socket = new WebSocket(url)
    socket.onopen = () => onStatus(true)
    socket.onmessage = (msg) => {
      try {
        onEvent(JSON.parse(String(msg.data)) as ServerEvent)
      } catch {
        /* ignore malformed frames */
      }
    }
    socket.onclose = () => {
      onStatus(false)
      if (!closed) retry = setTimeout(open, 2000)
    }
    socket.onerror = () => socket?.close()
  }

  open()
  return () => {
    closed = true
    if (retry) clearTimeout(retry)
    socket?.close()
  }
}
