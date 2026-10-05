import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, CheckCircle2, IdCard, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import AuthShell from './AuthShell'
import { Button, Notice, Segmented } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { ApiError, post } from '../../lib/api'
import type { SyncSummary, User } from '../../lib/types'

type SduResult =
  | { status: 'ok'; user: User; created: boolean; sync: SyncSummary }
  | { status: 'otp'; challenge_id: string; message: string }

const DEMO = [
  { label: 'Student', email: 'student@sdu.demo', password: 'student2026' },
  { label: 'Advisor', email: 'advisor.cs@sdu.demo', password: 'advisor2026' },
  { label: 'Registrar', email: 'admin@sdu.demo', password: 'admin2026' },
]

export default function Login() {
  const { setUser, meta } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'sdu' | 'email'>('sdu')
  const [studentId, setStudentId] = useState('')
  const [password, setPassword] = useState('')
  const [email, setEmail] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [otp, setOtp] = useState<{ id: string; message: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const finish = (result: Extract<SduResult, { status: 'ok' }>) => {
    setUser(result.user)
    const s = result.sync
    toast(
      'success',
      result.created ? `Welcome, ${result.user.name.split(' ')[0]}!` : 'Synced with my.sdu.edu.kz',
      `${s.enrollments ? `${s.enrollments} classes` : 'Schedule'}${s.term ? ` for ${s.term}` : ''} · ${s.transcript} transcript records imported`,
    )
    navigate('/')
  }

  const submitSdu = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!/^\d{6,12}$/.test(studentId.trim())) {
      setError('Enter your SDU student ID (digits only, e.g. 230107001).')
      return
    }
    setBusy(true)
    try {
      const result = await post<SduResult>('/api/auth/sdu/login', { student_id: studentId.trim(), password })
      if (result.status === 'otp') setOtp({ id: result.challenge_id, message: result.message })
      else finish(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  const submitOtp = async (e: FormEvent) => {
    e.preventDefault()
    if (!otp) return
    setBusy(true)
    setError(null)
    try {
      const result = await post<SduResult>('/api/auth/sdu/otp', { challenge_id: otp.id, code: code.trim() })
      if (result.status === 'ok') finish(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed.')
      if (err instanceof ApiError && (err.status === 410 || err.status === 401)) setOtp(null)
    } finally {
      setBusy(false)
      setCode('')
    }
  }

  const submitEmail = async (e: FormEvent, override?: { email: string; password: string }) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const creds = override ?? { email, password: emailPassword }
      const { user } = await post<{ user: User }>('/api/auth/login', creds)
      setUser(user)
      navigate(user.role === 'advisor' ? '/advisor' : user.role === 'admin' ? '/admin' : '/')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <div className="auth-card">
        {busy && mode === 'sdu' && !otp ? (
          <div className="syncing">
            <div className="orbit" />
            <div>
              <h2 style={{ fontSize: 24 }}>Connecting to my.sdu.edu.kz</h2>
              <p className="sub">This usually takes a few seconds.</p>
            </div>
            <div className="steps">
              <div className="done">
                <CheckCircle2 /> Verifying your SDU credentials
              </div>
              <div>
                <span className="spinner" style={{ width: 14, height: 14 }} /> Importing schedule, grades and transcript
              </div>
            </div>
          </div>
        ) : otp ? (
          <>
            <span className="sdu-badge">
              <i>SDU</i> Two-step verification
            </span>
            <h2 style={{ marginTop: 18 }}>Enter the code</h2>
            <p className="sub">{otp.message}</p>
            <form onSubmit={submitOtp}>
              {error && <Notice tone="danger">{error}</Notice>}
              <input
                className="input code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={8}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                placeholder="••••••"
                autoFocus
              />
              <Button variant="primary" size="lg" block loading={busy} disabled={code.length < 4}>
                Verify and continue
              </Button>
              <button type="button" className="link" style={{ alignSelf: 'center', fontSize: 13 }} onClick={() => setOtp(null)}>
                Start over
              </button>
            </form>
          </>
        ) : (
          <>
            <span className="sdu-badge">
              <i>SDU</i> my.sdu.edu.kz account
            </span>
            <h2 style={{ marginTop: 18 }}>Sign in</h2>
            <p className="sub">Use the same student ID and password as on my.sdu.edu.kz. First sign-in creates your account.</p>

            <div style={{ marginTop: 22 }}>
              <Segmented
                full
                value={mode}
                onChange={(m) => {
                  setMode(m)
                  setError(null)
                }}
                options={[
                  { value: 'sdu', label: 'SDU account' },
                  { value: 'email', label: 'E-mail & password' },
                ]}
              />
            </div>

            {mode === 'sdu' ? (
              <form onSubmit={submitSdu}>
                {error && <Notice tone="danger">{error}</Notice>}
                {meta && !meta.config.sdu_login && (
                  <Notice tone="warning">Sign-in with SDU accounts is disabled on this server.</Notice>
                )}
                <label className="field">
                  <span>Student ID</span>
                  <div className="input-icon">
                    <IdCard />
                    <input
                      className="input"
                      inputMode="numeric"
                      autoComplete="username"
                      placeholder="230107001"
                      value={studentId}
                      onChange={(e) => setStudentId(e.target.value)}
                      required
                    />
                  </div>
                </label>
                <label className="field">
                  <span>my.sdu password</span>
                  <div className="input-icon">
                    <KeyRound />
                    <input
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Your portal password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                </label>
                <Button variant="primary" size="lg" block loading={busy} icon={<ArrowRight />}>
                  Sign in with SDU
                </Button>
                <div className="privacy">
                  <ShieldCheck />
                  <span>
                    Your password goes straight to my.sdu.edu.kz to import your courses and is <b>never stored</b>. We keep
                    only your schedule, grades and profile.
                  </span>
                </div>
              </form>
            ) : (
              <form onSubmit={(e) => submitEmail(e)}>
                {error && <Notice tone="danger">{error}</Notice>}
                <label className="field">
                  <span>E-mail</span>
                  <div className="input-icon">
                    <Mail />
                    <input
                      className="input"
                      type="email"
                      autoComplete="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                </label>
                <label className="field">
                  <span className="row between">
                    Password
                    <Link to="/forgot-password" className="link" style={{ fontSize: 12.5 }}>
                      Forgot password?
                    </Link>
                  </span>
                  <div className="input-icon">
                    <KeyRound />
                    <input
                      className="input"
                      type="password"
                      autoComplete="current-password"
                      placeholder="Your password"
                      value={emailPassword}
                      onChange={(e) => setEmailPassword(e.target.value)}
                      required
                    />
                  </div>
                </label>
                <Button variant="primary" size="lg" block loading={busy}>
                  Sign in
                </Button>
                <p className="muted" style={{ textAlign: 'center', fontSize: 13.5 }}>
                  No SDU access? <Link to="/register" className="link">Create an account</Link>
                </p>
              </form>
            )}

            <div className="demo-box">
              <b style={{ color: 'var(--ink-2)' }}>Demo accounts</b> — explore with sample data:
              <div style={{ marginTop: 6 }}>
                {DEMO.map((d) => (
                  <button
                    key={d.email}
                    type="button"
                    onClick={(e) => {
                      setMode('email')
                      setEmail(d.email)
                      setEmailPassword(d.password)
                      void submitEmail(e as unknown as FormEvent, d)
                    }}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </AuthShell>
  )
}
