import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, Mail } from 'lucide-react'
import AuthShell from './AuthShell'
import { Button, Notice } from '../../components/ui'
import { errorText, post } from '../../lib/api'

export function ForgotPassword() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const data = await post<{ message: string; development_reset_token?: string }>('/api/auth/forgot-password', { email })
      if (data.development_reset_token) {
        navigate(`/reset-password?token=${encodeURIComponent(data.development_reset_token)}`)
        return
      }
      setMessage(data.message)
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <h2>Reset your password</h2>
        <p className="sub">For e-mail accounts. SDU accounts use the password from my.sdu.edu.kz.</p>
        <form onSubmit={submit}>
          {message && <Notice tone="success">{message}</Notice>}
          {error && <Notice tone="danger">{error}</Notice>}
          <label className="field">
            <span>E-mail</span>
            <div className="input-icon">
              <Mail />
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="name@example.com" />
            </div>
          </label>
          <Button variant="primary" size="lg" block loading={busy}>
            Send reset link
          </Button>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13.5 }}>
            <Link to="/login" className="link">Back to sign in</Link>
          </p>
        </form>
      </div>
    </AuthShell>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    setError(null)
    try {
      await post('/api/auth/reset-password', { token: params.get('token') ?? '', password })
      navigate('/login?reset=1')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <h2>Choose a new password</h2>
        <p className="sub">All other sessions will be signed out.</p>
        <form onSubmit={submit}>
          {error && <Notice tone="danger">{error}</Notice>}
          <label className="field">
            <span>New password</span>
            <div className="input-icon">
              <KeyRound />
              <input className="input" type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
          </label>
          <label className="field">
            <span>Repeat password</span>
            <input className="input" type="password" autoComplete="new-password" minLength={8} required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <Button variant="primary" size="lg" block loading={busy}>
            Save password
          </Button>
        </form>
      </div>
    </AuthShell>
  )
}
