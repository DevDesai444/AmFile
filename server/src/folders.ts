import { query, queryOne } from './db.js'
import { writeAudit } from './audit.js'
import type { SessionUser } from './auth.js'

export type Access = 'viewer' | 'editor' | 'owner'

/** Ranking so "at least editor" style checks are a comparison, not a list of equalities. */
const RANK: Record<Access, number> = { viewer: 1, editor: 2, owner: 3 }

export function atLeast(actual: Access | null, required: Access): boolean {
  return actual !== null && RANK[actual] >= RANK[required]
}

export interface FolderNode {
  id: string
  name: string
  parentId: string | null
  access: Access
  children: FolderNode[]
  documents: Array<{
    id: string
    path: string
    title: string
    currentRevision: number
    updatedAt: string | null
    lockedBy: { userId: string; displayName: string } | null
  }>
}

/** Effective access on a folder, resolved in the database so inheritance logic lives in one place. */
export async function effectiveAccess(userId: string, folderId: string): Promise<Access | null> {
  const row = await queryOne<{ access: Access | null }>('SELECT amfile_effective_access($1,$2) AS access', [
    userId,
    folderId
  ])
  return row?.access ?? null
}

/** Effective access on the folder a document lives in. */
export async function accessForDocument(userId: string, documentId: string): Promise<Access | null> {
  const row = await queryOne<{ access: Access | null }>(
    `SELECT amfile_effective_access($1, d.folder_id) AS access FROM documents d WHERE d.id = $2`,
    [userId, documentId]
  )
  return row?.access ?? null
}

/**
 * The folder tree as this user can see it: folders they have any access to, with the
 * documents inside. Folders they cannot reach are simply absent rather than shown locked —
 * for regulated content, not revealing that a submission exists is the safer default.
 */
export async function folderTreeFor(user: SessionUser): Promise<FolderNode[]> {
  const folders = await query<{
    id: string
    name: string
    parent_id: string | null
    access: Access | null
  }>(
    `SELECT f.id, f.name, f.parent_id, amfile_effective_access($1, f.id) AS access
       FROM folders f
      WHERE f.archived_at IS NULL
      ORDER BY f.name`,
    [user.id]
  )

  const docs = await query<{
    id: string
    folder_id: string | null
    path: string
    title: string
    current_revision: number
    updated_at: Date | null
    lock_user_id: string | null
    lock_display_name: string | null
  }>(
    `SELECT d.id, d.folder_id, d.path, d.title, d.current_revision,
            (SELECT max(created_at) FROM document_revisions r WHERE r.document_id = d.id) AS updated_at,
            l.user_id AS lock_user_id, lu.display_name AS lock_display_name
       FROM documents d
       LEFT JOIN document_locks l ON l.document_id = d.id AND l.expires_at > now()
       LEFT JOIN users lu ON lu.id = l.user_id
      WHERE d.archived_at IS NULL
      ORDER BY d.path`
  )

  const visible = folders.filter((f) => f.access !== null)
  const byId = new Map<string, FolderNode>()
  for (const f of visible) {
    byId.set(f.id, {
      id: f.id,
      name: f.name,
      parentId: f.parent_id,
      access: f.access as Access,
      children: [],
      documents: []
    })
  }

  for (const d of docs) {
    if (!d.folder_id) continue
    const node = byId.get(d.folder_id)
    if (!node) continue // folder not visible to this user, so neither is its content
    node.documents.push({
      id: d.id,
      path: d.path,
      title: d.title,
      currentRevision: d.current_revision,
      updatedAt: d.updated_at?.toISOString() ?? null,
      lockedBy: d.lock_user_id ? { userId: d.lock_user_id, displayName: d.lock_display_name ?? 'Unknown' } : null
    })
  }

  const roots: FolderNode[] = []
  for (const node of byId.values()) {
    const parent = node.parentId ? byId.get(node.parentId) : undefined
    // A folder whose parent is hidden is surfaced at the top level rather than dropped —
    // otherwise granting access to just a subfolder would make it unreachable.
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

export async function createFolder(
  user: SessionUser,
  name: string,
  parentId: string | null
): Promise<{ id: string } | { error: string }> {
  if (parentId) {
    const access = await effectiveAccess(user.id, parentId)
    if (!atLeast(access, 'editor')) return { error: 'You do not have rights to create folders here.' }
  }
  // A top-level folder is a project, and anyone may start one — they become its owner and
  // decide who else gets in. Requiring an administrator here made "create a project" a
  // privileged act, which is not how the product is meant to work.

  const existing = await queryOne<{ id: string }>(
    parentId
      ? 'SELECT id FROM folders WHERE parent_id = $1 AND name = $2'
      : 'SELECT id FROM folders WHERE parent_id IS NULL AND name = $1',
    parentId ? [parentId, name] : [name]
  )
  if (existing) return { error: 'A folder with that name already exists here.' }

  const row = await query<{ id: string }>(
    'INSERT INTO folders (name, parent_id, created_by) VALUES ($1,$2,$3) RETURNING id',
    [name, parentId, user.id]
  )
  const id = row[0].id

  // The creator owns what they create, otherwise a non-admin would immediately lose sight of
  // the folder they just made.
  await query('INSERT INTO folder_permissions (folder_id, user_id, access, granted_by) VALUES ($1,$2,$3,$2)', [
    id,
    user.id,
    'owner'
  ])
  await writeAudit({
    userId: user.id,
    printedName: user.displayName,
    action: 'folder.created',
    newValue: { name, parentId }
  })
  return { id }
}

export interface FolderMember {
  userId: string
  displayName: string
  email: string
  access: Access
  inherited: boolean
}

export async function folderMembers(folderId: string): Promise<FolderMember[]> {
  const direct = await query<{ user_id: string; display_name: string; email: string; access: Access }>(
    `SELECT p.user_id, u.display_name, u.email, p.access
       FROM folder_permissions p JOIN users u ON u.id = p.user_id
      WHERE p.folder_id = $1 ORDER BY u.display_name`,
    [folderId]
  )
  const directIds = new Set(direct.map((d) => d.user_id))

  // Anyone who can reach this folder only through a parent grant, shown so an owner can see
  // the real access list rather than just the local one.
  const all = await query<{ id: string; display_name: string; email: string; access: Access | null }>(
    `SELECT u.id, u.display_name, u.email, amfile_effective_access(u.id, $1) AS access
       FROM users u WHERE u.active ORDER BY u.display_name`,
    [folderId]
  )

  return [
    ...direct.map((d) => ({
      userId: d.user_id,
      displayName: d.display_name,
      email: d.email,
      access: d.access,
      inherited: false
    })),
    ...all
      .filter((u) => u.access !== null && !directIds.has(u.id))
      .map((u) => ({
        userId: u.id,
        displayName: u.display_name,
        email: u.email,
        access: u.access as Access,
        inherited: true
      }))
  ]
}

export async function setFolderAccess(
  actor: SessionUser,
  folderId: string,
  targetUserId: string,
  access: Access | null
): Promise<string | null> {
  const mine = await effectiveAccess(actor.id, folderId)
  if (!atLeast(mine, 'owner')) return 'You need owner access on this folder to change permissions.'

  const target = await queryOne<{ display_name: string }>('SELECT display_name FROM users WHERE id = $1', [
    targetUserId
  ])
  if (!target) return 'No such user.'

  if (access === null) {
    await query('DELETE FROM folder_permissions WHERE folder_id = $1 AND user_id = $2', [folderId, targetUserId])
  } else {
    await query(
      `INSERT INTO folder_permissions (folder_id, user_id, access, granted_by) VALUES ($1,$2,$3,$4)
       ON CONFLICT (folder_id, user_id) DO UPDATE SET access = $3, granted_by = $4, granted_at = now()`,
      [folderId, targetUserId, access, actor.id]
    )
  }

  await writeAudit({
    userId: actor.id,
    printedName: actor.displayName,
    action: access === null ? 'permission.revoked' : 'permission.granted',
    newValue: { folderId, target: target.display_name, access }
  })
  return null
}
