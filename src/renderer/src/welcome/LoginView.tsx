import { useState, useEffect, useRef, type FormEvent } from 'react'
import { LogIn, AlertCircle, Github, Copy, Check, ExternalLink } from 'lucide-react'
import logo from '../assets/amneal-logo.png'
import BlueprintCard from '../common/BlueprintCard'
import { api } from '../api/client'
import { useSessionStore } from '../store/sessionStore'

/**
 * Sign in. GitHub is the identity: AmFile issues no accounts of its own, so there is no
 * "create account" here and nothing to fill in beyond approving on github.com.
 *
 * The email/password form is only shown when the server has no GitHub client id configured,
 * so nobody is ever offered a button that cannot work.
 */
export default function LoginView(): React.JSX.Element {
  const signIn = useSessionStore((s) => s.signIn)
  const signInWithToken = useSessionStore((s) => s.signInWithToken)
  const busy = useSessionStore((s) => s.busy)
  const error = useSessionStore((s) => s.error)

  const [methods, setMethods] = useState<{ github: boolean; password: boolean } | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [device, setDevice] = useState<{ userCode: string; verificationUri: string } | null>(null)
  const [ghError, setGhError] = useState<string | null>(null)
  const [ghBusy, setGhBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [needsAccount, setNeedsAccount] = useState(false)
  const cancelled = useRef(false)

  useEffect(() => {
    api
      .authMethods()
      .then(setMethods)
      .catch(() => setMethods({ github: false, password: true }))
    return () => {
      cancelled.current = true
    }
  }, [])

  const submit = (e: FormEvent): void => {
    e.preventDefault()
    if (!email || !password || busy) return
    void signIn(email, password)
  }

  const startGithub = async (): Promise<void> => {
    setGhBusy(true)
    setGhError(null)
    cancelled.current = false
    try {
      const start = await api.githubStart()
      setDevice({ userCode: start.userCode, verificationUri: start.verificationUri })
      void window.amfile?.openExternal?.(start.verificationUri)

      // Poll at the interval GitHub asked for; it tells us to back off if we go too fast.
      let interval = start.interval
      const deadline = Date.now() + start.expiresIn * 1000
      while (!cancelled.current && Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, interval * 1000))
        if (cancelled.current) return
        const result = await api.githubPoll(start.deviceCode)
        if (result.status === 'ok') {
          signInWithToken(result.token, result.user)
          return
        }
        if (result.status === 'slow_down') interval = result.interval
        if (result.status === 'denied') {
          setGhError('Sign-in was declined on GitHub.')
          setDevice(null)
          return
        }
        if (result.status === 'expired') {
          setGhError('That code expired. Start again.')
          setDevice(null)
          return
        }
      }
      if (!cancelled.current) {
        setGhError('That code expired. Start again.')
        setDevice(null)
      }
    } catch (err) {
      setGhError(err instanceof Error ? err.message : 'Could not reach GitHub.')
      setDevice(null)
    } finally {
      setGhBusy(false)
    }
  }

  return (
    <div className="login-view">
      <img src={logo} alt="Amneal" className="login-logo" />
      <h1>AmFile</h1>
      <p className="login-subtitle">Regulatory document authoring</p>

      <BlueprintCard className="login-card">
        {methods?.github && !device && (
          <>
            <button type="button" className="login-github" disabled={ghBusy} onClick={() => void startGithub()}>
              <Github size={15} strokeWidth={1.5} />
              {ghBusy ? 'Opening GitHub…' : 'Sign in with GitHub'}
            </button>
            <button type="button" className="login-link" onClick={() => setNeedsAccount(true)}>
              I don’t have a GitHub account
            </button>
          </>
        )}

        {device && (
          <div className="login-device">
            <p className="login-device-lead">Enter this code on GitHub:</p>
            <div className="login-device-code">
              <code>{device.userCode}</code>
              <button
                type="button"
                aria-label="Copy code"
                onClick={() => {
                  void navigator.clipboard.writeText(device.userCode)
                  setCopied(true)
                  setTimeout(() => setCopied(false), 1500)
                }}
              >
                {copied ? <Check size={13} strokeWidth={1.5} /> : <Copy size={13} strokeWidth={1.5} />}
              </button>
            </div>
            <button
              type="button"
              className="login-link"
              onClick={() => void window.amfile?.openExternal?.(device.verificationUri)}
            >
              <ExternalLink size={12} strokeWidth={1.5} /> {device.verificationUri}
            </button>
            <p className="login-device-wait">Waiting for you to approve…</p>
            <button
              type="button"
              className="login-link"
              onClick={() => {
                cancelled.current = true
                setDevice(null)
              }}
            >
              Cancel
            </button>
          </div>
        )}

        {ghError && (
          <div className="login-error">
            <AlertCircle size={13} strokeWidth={1.5} />
            <span>{ghError}</span>
          </div>
        )}

        {methods && !methods.github && (
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
        )}
      </BlueprintCard>

      <p className="login-footnote">
        Projects find you by your email address — sign in and anything you have been added to is already there.
      </p>

      {needsAccount && (
        <div className="dialog-backdrop" onClick={() => setNeedsAccount(false)}>
          <BlueprintCard className="login-nudge" onClick={() => undefined}>
            <div onClick={(e) => e.stopPropagation()}>
            <Github size={22} strokeWidth={1.5} />
            <h2>Make a GitHub account</h2>
            <p>It takes a minute and it’s free. Use your Amneal email address so your projects find you.</p>
            <button
              type="button"
              className="login-submit"
              onClick={() => {
                void window.amfile?.openExternal?.('https://github.com/signup')
                setNeedsAccount(false)
              }}
            >
              Open github.com/signup
            </button>
            <button type="button" className="login-link" onClick={() => setNeedsAccount(false)}>
              Close
            </button>
            </div>
          </BlueprintCard>
        </div>
      )}
    </div>
  )
}
