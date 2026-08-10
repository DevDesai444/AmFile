import { useState, type FormEvent } from 'react'
import { LogIn, AlertCircle } from 'lucide-react'
import logo from '../assets/amneal-logo.png'
import BlueprintCard from '../common/BlueprintCard'
import { useSessionStore } from '../store/sessionStore'

export default function LoginView(): React.JSX.Element {
  const signIn = useSessionStore((s) => s.signIn)
  const busy = useSessionStore((s) => s.busy)
  const error = useSessionStore((s) => s.error)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!email || !password || busy) return
    void signIn(email, password)
  }

  return (
    <div className="login-view">
      <img src={logo} alt="Amneal" className="login-logo" />
      <h1>AmFile</h1>
      <p className="login-subtitle">Regulatory document authoring</p>

      <BlueprintCard className="login-card">
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="username"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@amneal.com"
          />

          <label htmlFor="login-password">Password</label>
          <input
            id="login-password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />

          {error && (
            <div className="login-error">
              <AlertCircle size={13} strokeWidth={1.5} />
              <span>{error}</span>
            </div>
          )}

          <button type="submit" className="login-submit" disabled={busy || !email || !password}>
            <LogIn size={14} strokeWidth={1.5} />
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </BlueprintCard>

      <p className="login-footnote">
        Accounts are managed by AmFile. Five failed attempts locks an account for 15 minutes; passwords expire after 90
        days.
      </p>
    </div>
  )
}
