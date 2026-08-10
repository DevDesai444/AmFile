import { useCallback, useEffect, useState } from 'react'
import { UserPlus, Copy, KeyRound, Check } from 'lucide-react'
import BlueprintCard from '../common/BlueprintCard'
import { api, type AdminUser, type ApiUser } from '../api/client'
import { useSessionStore } from '../store/sessionStore'
import { useToastStore } from '../common/toastStore'

type Role = ApiUser['roles'][number]
const ALL_ROLES: Role[] = ['author', 'reviewer', 'approver', 'admin']

export default function UsersView(): React.JSX.Element {
  const me = useSessionStore((s) => s.user)
  const push = useToastStore((s) => s.push)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [roles, setRoles] = useState<Role[]>(['author'])
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      const { users } = await api.listUsers()
      setUsers(users)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load users.')
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (!me?.roles.includes('admin')) {
    return (
      <div className="settings-view">
        <h2>Users</h2>
        <p className="users-note">You need the administrator role to manage users.</p>
      </div>
    )
  }

  const invite = async (): Promise<void> => {
    if (!email || !name || roles.length === 0) return
    setBusy(true)
    try {
      const res = await api.inviteUser(email, name, roles)
      setIssued({ email, password: res.temporaryPassword })
      setEmail('')
      setName('')
      setRoles(['author'])
      await load()
    } catch (err) {
      push(err instanceof Error ? err.message : 'Could not create the account.', 'error')
    } finally {
      setBusy(false)
    }
  }

  const copy = async (text: string): Promise<void> => {
    await navigator.clipboard.writeText(text)
    push('Copied to clipboard.')
  }

  return (
    <div className="settings-view users-view">
      <h2>Users</h2>
      <p className="users-note">
        There is no mail server, so AmFile issues a one-time password here for you to pass on. The person sets their own
        password when they first sign in, and your copy stops working at that point.
      </p>

      <BlueprintCard className="users-invite">
        <div className="users-invite-row">
          <div className="field">
            <label htmlFor="inv-email">Email</label>
            <input id="inv-email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@amneal.com" />
          </div>
          <div className="field">
            <label htmlFor="inv-name">Full name</label>
            <input id="inv-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Priya Shah" />
          </div>
        </div>
        <div className="field">
          <label>Roles</label>
          <div className="users-roles">
            {ALL_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                className={`role-chip${roles.includes(r) ? ' is-on' : ''}`}
                onClick={() => setRoles((cur) => (cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r]))}
              >
                {roles.includes(r) && <Check size={10} strokeWidth={2} />}
                {r}
              </button>
            ))}
          </div>
        </div>
        <button type="button" className="login-submit" disabled={busy || !email || !name || roles.length === 0} onClick={() => void invite()}>
          <UserPlus size={14} strokeWidth={1.5} />
          {busy ? 'Creating…' : 'Create account'}
        </button>
      </BlueprintCard>

      {issued && (
        <div className="users-issued">
          <div>
            <strong>Account created for {issued.email}</strong>
            <div className="users-issued-pw">
              Temporary password: <code>{issued.password}</code>
            </div>
            <div className="users-issued-note">
              Send this to them over a channel you trust. It is shown once — reset it from the list below if lost.
            </div>
          </div>
          <button type="button" onClick={() => void copy(issued.password)} title="Copy password">
            <Copy size={13} strokeWidth={1.5} />
          </button>
        </div>
      )}

      {error && <p className="users-note">{error}</p>}

      <div className="users-table">
        {users.map((u) => (
          <div key={u.id} className={`users-row${u.active ? '' : ' is-inactive'}`}>
            <div className="users-row-main">
              <span className="users-name">{u.displayName}</span>
              <span className="users-email">{u.email}</span>
            </div>
            <div className="users-roles">
              {ALL_ROLES.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`role-chip${u.roles.includes(r) ? ' is-on' : ''}`}
                  title={`Toggle ${r}`}
                  onClick={() => {
                    const next = u.roles.includes(r) ? u.roles.filter((x) => x !== r) : [...u.roles, r]
                    void api
                      .setUserRoles(u.id, next)
                      .then(load)
                      .catch((e) => push(e instanceof Error ? e.message : 'Could not change roles.', 'error'))
                  }}
                >
                  {r}
                </button>
              ))}
            </div>
            <div className="users-actions">
              <button
                type="button"
                title="Issue a new temporary password"
                onClick={() =>
                  void api
                    .resetUserPassword(u.id)
                    .then((r) => setIssued({ email: u.email, password: r.temporaryPassword }))
                    .then(load)
                    .catch((e) => push(e instanceof Error ? e.message : 'Could not reset.', 'error'))
                }
              >
                <KeyRound size={12} strokeWidth={1.5} />
              </button>
              <button
                type="button"
                className="users-toggle"
                onClick={() =>
                  void api
                    .setUserActive(u.id, !u.active)
                    .then(load)
                    .catch((e) => push(e instanceof Error ? e.message : 'Could not update.', 'error'))
                }
              >
                {u.active ? 'Deactivate' : 'Reactivate'}
              </button>
            </div>
          </div>
        ))}
      </div>

      <p className="users-note">
        Accounts are deactivated, never deleted — the audit trail refers to them permanently, and 21 CFR 11.100(a)
        requires that an ID is never reused or reassigned.
      </p>
    </div>
  )
}
