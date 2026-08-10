import { randomBytes } from 'node:crypto'
import { query, queryOne } from './db.js'
import { hashPassword, passwordProblem, type Role, type SessionUser } from './auth.js'
import { writeAudit } from './audit.js'

export interface UserRow {
  id: string
  email: string
  displayName: string
  roles: Role[]
  active: boolean
  lastSeenAt: string | null
  mustChangePassword: boolean
  lockedUntil: string | null
  passwordUpdatedAt: string | null
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = await query<{
    id: string
    email: string
    display_name: string
    active: boolean
    last_seen_at: Date | null
    must_change_password: boolean
    locked_until: Date | null
    password_updated_at: Date | null
    roles: string[] | null
  }>(
    `SELECT u.id, u.email, u.display_name, u.active, u.last_seen_at, u.must_change_password,
            u.locked_until, u.password_updated_at,
            array_agg(r.role) FILTER (WHERE r.role IS NOT NULL) AS roles
       FROM users u LEFT JOIN user_roles r ON r.user_id = u.id
      GROUP BY u.id ORDER BY u.display_name`
  )
  return rows.map((r) => ({
    id: r.id,
    email: r.email,
    displayName: r.display_name,
    roles: (r.roles ?? []) as Role[],
    active: r.active,
    lastSeenAt: r.last_seen_at?.toISOString() ?? null,
    mustChangePassword: r.must_change_password,
    lockedUntil: r.locked_until?.toISOString() ?? null,
    passwordUpdatedAt: r.password_updated_at?.toISOString() ?? null
  }))
}

/** Readable temporary password. Ambiguous characters are left out so it survives being read
 *  aloud or copied by hand without a support call. */
export function generateTempPassword(): string {
  const words = ['Amber', 'Cobalt', 'Harbor', 'Juniper', 'Lantern', 'Meadow', 'Quartz', 'Summit', 'Willow']
  const word = words[randomBytes(1)[0] % words.length]
  const digits = String(1000 + (randomBytes(2).readUInt16BE(0) % 9000))
  return `${word}-${digits}!`
}

export interface InviteResult {
  ok: boolean
  error?: string
  user?: UserRow
  temporaryPassword?: string
}

/**
 * Create an account and return a one-time password for the admin to pass on.
 *
 * There is no mail server here, so the credential is handed back through the UI and the
 * account is flagged must_change_password — the invitee sets their own password on first
 * sign-in, and the admin's copy stops being valid at that point.
 */
export async function inviteUser(
  actor: SessionUser,
  email: string,
  displayName: string,
  roles: Role[]
): Promise<InviteResult> {
  const normalized = email.trim().toLowerCase()
  const existing = await queryOne<{ id: string }>('SELECT id FROM users WHERE lower(email) = $1', [normalized])
  if (existing) return { ok: false, error: 'An account with that email already exists.' }

  const temporaryPassword = generateTempPassword()
  const problem = passwordProblem(temporaryPassword)
  if (problem) return { ok: false, error: `Generated password rejected: ${problem}` }

  const inserted = await query<{ id: string }>(
    `INSERT INTO users (email, display_name, password_hash, password_updated_at, must_change_password)
     VALUES ($1,$2,$3, now(), true) RETURNING id`,
    [email.trim(), displayName.trim(), await hashPassword(temporaryPassword)]
  )
  const id = inserted[0].id
  for (const role of roles) {
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, role])
  }

  await writeAudit({
    userId: actor.id,
    printedName: actor.displayName,
    action: 'user.invited',
    newValue: { email: normalized, displayName, roles }
  })

  const user = (await listUsers()).find((u) => u.id === id)
  return { ok: true, user, temporaryPassword }
}

export async function setActive(actor: SessionUser, userId: string, active: boolean): Promise<void> {
  // Deactivate, never delete — the audit trail references these rows permanently, and
  // 11.100(a) requires that an id is never reused or reassigned.
  await query('UPDATE users SET active = $2 WHERE id = $1', [userId, active])
  if (!active) await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId])
  const target = await queryOne<{ email: string }>('SELECT email FROM users WHERE id = $1', [userId])
  await writeAudit({
    userId: actor.id,
    printedName: actor.displayName,
    action: active ? 'user.reactivated' : 'user.deactivated',
    newValue: { userId, email: target?.email }
  })
}

export async function setRoles(actor: SessionUser, userId: string, roles: Role[]): Promise<void> {
  const before = await query<{ role: string }>('SELECT role FROM user_roles WHERE user_id = $1', [userId])
  await query('DELETE FROM user_roles WHERE user_id = $1', [userId])
  for (const role of roles) {
    await query('INSERT INTO user_roles (user_id, role) VALUES ($1,$2) ON CONFLICT DO NOTHING', [userId, role])
  }
  await writeAudit({
    userId: actor.id,
    printedName: actor.displayName,
    action: 'user.roles_changed',
    oldValue: { roles: before.map((b) => b.role) },
    newValue: { userId, roles }
  })
}

export async function resetPassword(actor: SessionUser, userId: string): Promise<string> {
  const temporaryPassword = generateTempPassword()
  await query(
    `UPDATE users SET password_hash = $2, password_updated_at = now(), must_change_password = true,
       failed_login_count = 0, locked_until = NULL WHERE id = $1`,
    [userId, await hashPassword(temporaryPassword)]
  )
  await query('UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [userId])
  await writeAudit({
    userId: actor.id,
    printedName: actor.displayName,
    action: 'user.password_reset',
    newValue: { userId }
  })
  return temporaryPassword
}
