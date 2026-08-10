import { useState, type FormEvent } from 'react'
import { KeyRound, AlertCircle } from 'lucide-react'
import logo from '../assets/amneal-logo.png'
import BlueprintCard from '../common/BlueprintCard'
import { api } from '../api/client'
import { useSessionStore } from '../store/sessionStore'

/**
 * Shown when the account is flagged must_change_password — a new invite, or an admin reset.
 * Until this is done the app is not usable, which is what makes a one-time password actually
 * one-time.
 */
export default function ChangePasswordView(): React.JSX.Element {
  const user = useSessionStore((s) => s.user)
  const clearMustChange = useSessionStore((s) => s.clearMustChangePassword)
  const signOut = useSessionStore((s) => s.signOut)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const submit = async (e: FormEvent): Promise<void> => {
    e.preventDefault()
    if (next !== confirm) {
      setError('The two new passwords do not match.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.changePassword(current, next)
      // The server revokes every session on a password change, so sign in again cleanly.
      clearMustChange()
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not change the password.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-view">
      <img src={logo} alt="Amneal" className="login-logo" />
      <h1>Set your password</h1>
      <p className="login-subtitle">
        {user ? `Signed in as ${user.email}` : ''} — choose a password before continuing
      </p>

      <BlueprintCard className="login-card">
        <form onSubmit={(e) => void submit(e)}>
          <label htmlFor="cur-pw">Temporary password</label>
          <input id="cur-pw" type="password" autoFocus value={current} onChange={(e) => setCurrent(e.target.value)} />

          <label htmlFor="new-pw">New password</label>
          <input id="new-pw" type="password" value={next} onChange={(e) => setNext(e.target.value)} />

          <label htmlFor="con-pw">Confirm new password</label>
          <input id="con-pw" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />

          {error && (
            <div className="login-error">
              <AlertCircle size={13} strokeWidth={1.5} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-submit" disabled={busy || !current || !next || !confirm}>
            <KeyRound size={14} strokeWidth={1.5} />
            {busy ? 'Saving…' : 'Set password'}
          </button>
        </form>
      </BlueprintCard>

      <p className="login-footnote">
        At least 10 characters, including a letter and a digit. You will be signed in again afterwards.
      </p>
    </div>
  )
}
