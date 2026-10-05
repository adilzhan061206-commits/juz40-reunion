import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { KeyRound, Mail, User as UserIcon } from 'lucide-react'
import AuthShell from './AuthShell'
import { Button, Notice } from '../../components/ui'
import { useApp } from '../../context/app'
import { errorText, post } from '../../lib/api'
import type { User } from '../../lib/types'

export default function Register() {
  const { setUser, meta } = useApp()
  const navigate = useNavigate()
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', program_id: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value })

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (form.password.length < 8) return setError('Password must be at least 8 characters long.')
    if (form.password !== form.confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      const { user } = await post<{ user: User }>('/api/auth/register', {
        name: form.name,
        email: form.email,
        password: form.password,
        program_id: form.program_id ? Number(form.program_id) : null,
      })
      setUser(user)
      navigate('/')
    } catch (err) {
      setError(errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell>
      <div className="auth-card">
        <h2>Create an account</h2>
        <p className="sub">
          For applicants, guests and anyone without a my.sdu login. Students can{' '}
          <Link to="/login" className="link">sign in with SDU</Link> instead — no registration needed.
        </p>
        <form onSubmit={submit}>
          {error && <Notice tone="danger">{error}</Notice>}
          <label className="field">
            <span>Full name</span>
            <div className="input-icon">
              <UserIcon />
              <input className="input" autoComplete="name" value={form.name} onChange={set('name')} required maxLength={80} placeholder="Aruzhan Serikova" />
            </div>
          </label>
          <label className="field">
            <span>E-mail</span>
            <div className="input-icon">
              <Mail />
              <input className="input" type="email" autoComplete="email" value={form.email} onChange={set('email')} required placeholder="name@example.com" />
            </div>
          </label>
          <label className="field">
            <span>Degree programme</span>
            <select className="select" value={form.program_id} onChange={set('program_id')}>
              <option value="">Choose later</option>
              {meta?.programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div className="grid cols-2" style={{ gap: 12 }}>
            <label className="field">
              <span>Password</span>
              <div className="input-icon">
                <KeyRound />
                <input className="input" type="password" autoComplete="new-password" value={form.password} onChange={set('password')} required minLength={8} placeholder="8+ characters" />
              </div>
            </label>
            <label className="field">
              <span>Repeat password</span>
              <input className="input" type="password" autoComplete="new-password" value={form.confirm} onChange={set('confirm')} required minLength={8} placeholder="Same again" />
            </label>
          </div>
          <Button variant="primary" size="lg" block loading={busy}>
            Create account
          </Button>
          <p className="muted" style={{ textAlign: 'center', fontSize: 13.5 }}>
            Already have an account? <Link to="/login" className="link">Sign in</Link>
          </p>
        </form>
      </div>
    </AuthShell>
  )
}
