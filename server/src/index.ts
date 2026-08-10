import Fastify from 'fastify'
import cors from '@fastify/cors'
import websocket from '@fastify/websocket'
import { z } from 'zod'
import { login, logout, resolveSession, changePassword, requireRole, type SessionUser } from './auth.js'
import {
  listDocuments,
  createDocument,
  getDocument,
  saveRevision,
  acquireLock,
  releaseLock,
  heartbeatLock,
  documentHistory,
  listComments,
  addComment,
  resolveComment,
  deleteComment
} from './documents.js'
import { writeAudit, verifyAuditChain } from './audit.js'
import { query } from './db.js'

const PORT = Number(process.env.PORT ?? 8787)
const app = Fastify({ logger: { level: 'warn' } })

await app.register(cors, { origin: true, credentials: true })
await app.register(websocket)

// ------------------------------------------------------------------ realtime broadcast
type Client = { socket: { send: (data: string) => void }; user: SessionUser }
const clients = new Set<Client>()

export function broadcast(event: string, payload: unknown, exceptUserId?: string): void {
  const message = JSON.stringify({ event, payload })
  for (const c of clients) {
    if (exceptUserId && c.user.id === exceptUserId) continue
    try {
      c.socket.send(message)
    } catch {
      clients.delete(c)
    }
  }
}

// ------------------------------------------------------------------------- auth helper
function bearer(req: { headers: Record<string, unknown> }): string | undefined {
  const raw = req.headers['authorization']
  if (typeof raw !== 'string') return undefined
  return raw.startsWith('Bearer ') ? raw.slice(7) : undefined
}

async function requireUser(req: never, reply: never): Promise<SessionUser | null> {
  const r = req as unknown as { headers: Record<string, unknown> }
  const user = await resolveSession(bearer(r))
  if (!user) {
    ;(reply as unknown as { code: (n: number) => { send: (b: unknown) => void } })
      .code(401)
      .send({ error: 'Not signed in' })
    return null
  }
  return user
}

// -------------------------------------------------------------------------------- auth
app.post('/api/auth/login', async (req, reply) => {
  const body = z.object({ email: z.string().email(), password: z.string().min(1) }).safeParse(req.body)
  if (!body.success) return reply.code(400).send({ error: 'Email and password are required.' })
  const result = await login(body.data.email, body.data.password, String(req.headers['user-agent'] ?? ''))
  if (!result.ok) return reply.code(401).send({ error: result.error })
  return { token: result.token, user: result.user, passwordExpired: result.passwordExpired }
})

app.post('/api/auth/logout', async (req, reply) => {
  const user = await resolveSession(bearer(req as never))
  await logout(bearer(req as never), user)
  return reply.send({ ok: true })
})

app.get('/api/auth/me', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  return { user }
})

app.post('/api/auth/change-password', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const body = z.object({ current: z.string(), next: z.string() }).safeParse(req.body)
  if (!body.success) return reply.code(400).send({ error: 'Both passwords are required.' })
  const problem = await changePassword(user, body.data.current, body.data.next)
  if (problem) return reply.code(400).send({ error: problem })
  return { ok: true }
})

// --------------------------------------------------------------------------- documents
app.get('/api/documents', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  return { documents: await listDocuments() }
})

app.post('/api/documents', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  if (!requireRole(user, 'author')) return reply.code(403).send({ error: 'You do not have authoring rights.' })
  const body = z.object({ path: z.string().min(1), title: z.string().min(1) }).safeParse(req.body)
  if (!body.success) return reply.code(400).send({ error: 'path and title are required.' })
  const doc = await createDocument(user, body.data.path, body.data.title)
  broadcast('documents:changed', { reason: 'created', documentId: doc.id })
  return { document: doc }
})

app.get('/api/documents/:id', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  const rev = (req.query as { revision?: string }).revision
  const doc = await getDocument(id, rev ? Number(rev) : undefined)
  if (!doc) return reply.code(404).send({ error: 'No such document' })
  await writeAudit({ userId: user.id, printedName: user.displayName, action: 'document.opened', documentId: id })
  return { document: doc }
})

app.get('/api/documents/:id/history', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  return { history: await documentHistory(id) }
})

app.post('/api/documents/:id/save', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  if (!requireRole(user, 'author')) return reply.code(403).send({ error: 'You do not have authoring rights.' })
  const { id } = req.params as { id: string }
  const body = z
    .object({
      baseRevision: z.number().int().nonnegative(),
      content: z.unknown(),
      pageSetup: z.unknown().optional(),
      header: z.unknown().optional(),
      footer: z.unknown().optional(),
      reason: z.string().optional()
    })
    .safeParse(req.body)
  if (!body.success) return reply.code(400).send({ error: 'Malformed save payload.' })

  const outcome = await saveRevision(
    user,
    id,
    body.data.baseRevision,
    {
      content: body.data.content,
      pageSetup: body.data.pageSetup ?? {},
      header: body.data.header ?? null,
      footer: body.data.footer ?? null
    },
    body.data.reason
  )
  if (!outcome.ok) return reply.code(409).send(outcome)

  broadcast('document:updated', {
    documentId: id,
    revision: outcome.revision,
    savedBy: user.displayName,
    savedByUserId: user.id,
    savedAt: new Date().toISOString()
  })
  return outcome
})

// -------------------------------------------------------------------------------- locks
app.post('/api/documents/:id/lock', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  const result = await acquireLock(user, id)
  if (!result.ok) return reply.code(409).send(result)
  broadcast('lock:changed', { documentId: id, lockedBy: user.displayName, lockedByUserId: user.id })
  return result
})

app.post('/api/documents/:id/unlock', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  const force = Boolean((req.body as { force?: boolean } | undefined)?.force)
  if (force && !requireRole(user, 'admin')) {
    return reply.code(403).send({ error: 'Only an administrator can force a check-in.' })
  }
  await releaseLock(user, id, force)
  broadcast('lock:changed', { documentId: id, lockedBy: null, lockedByUserId: null })
  return { ok: true }
})

app.post('/api/documents/:id/heartbeat', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  return { held: await heartbeatLock(user, id) }
})

// ----------------------------------------------------------------------------- comments
app.get('/api/documents/:id/comments', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  return { comments: await listComments(id) }
})

app.post('/api/documents/:id/comments', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id } = req.params as { id: string }
  const body = z
    .object({ markId: z.string().min(1), quotedText: z.string(), body: z.string().min(1) })
    .safeParse(req.body)
  if (!body.success) return reply.code(400).send({ error: 'markId, quotedText and body are required.' })
  await addComment(user, id, body.data.markId, body.data.quotedText, body.data.body)
  broadcast('comments:changed', { documentId: id }, user.id)
  return { ok: true }
})

app.post('/api/documents/:id/comments/:markId/resolve', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id, markId } = req.params as { id: string; markId: string }
  await resolveComment(user, id, markId)
  broadcast('comments:changed', { documentId: id }, user.id)
  return { ok: true }
})

app.delete('/api/documents/:id/comments/:markId', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { id, markId } = req.params as { id: string; markId: string }
  await deleteComment(user, id, markId)
  broadcast('comments:changed', { documentId: id }, user.id)
  return { ok: true }
})

// -------------------------------------------------------------------------------- audit
app.get('/api/audit', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  const { documentId, limit } = req.query as { documentId?: string; limit?: string }
  const rows = await query(
    `SELECT id, occurred_at, printed_name, action, document_id, revision_before, revision_after, reason
       FROM audit_log ${documentId ? 'WHERE document_id = $1' : ''}
      ORDER BY id DESC LIMIT ${Math.min(Number(limit ?? 200), 1000)}`,
    documentId ? [documentId] : []
  )
  return { entries: rows }
})

app.get('/api/audit/verify', async (req, reply) => {
  const user = await requireUser(req as never, reply as never)
  if (!user) return
  return await verifyAuditChain()
})

// ----------------------------------------------------------------------------- realtime
app.get('/ws', { websocket: true }, async (socket, req) => {
  const token = (req.query as { token?: string }).token
  const user = await resolveSession(token)
  if (!user) {
    socket.close(4001, 'Not signed in')
    return
  }
  const client: Client = { socket: socket as unknown as Client['socket'], user }
  clients.add(client)
  broadcast('presence:changed', { userId: user.id, displayName: user.displayName, online: true })
  socket.on('close', () => {
    clients.delete(client)
    broadcast('presence:changed', { userId: user.id, displayName: user.displayName, online: false })
  })
})

app.get('/api/health', async () => ({ ok: true, service: 'amfile-server' }))

await app.listen({ port: PORT, host: '127.0.0.1' })
console.log(`AmFile server listening on http://127.0.0.1:${PORT}`)
