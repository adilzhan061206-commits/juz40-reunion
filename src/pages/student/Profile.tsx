import { useState, type FormEvent } from 'react'
import { Bell, ClipboardPaste, KeyRound, Palette, RefreshCw, ShieldCheck, UserRound } from 'lucide-react'
import { Badge, Button, Card, CardHead, Field, Notice, PageHead, Segmented } from '../../components/ui'
import { useApp, useTheme, useToast } from '../../context/app'
import { ApiError, errorText, patch, post } from '../../lib/api'
import { initials, timeAgo } from '../../lib/format'
import type { SyncSummary, User } from '../../lib/types'

type SyncResult = { status: 'ok'; user: User; sync: SyncSummary } | { status: 'otp'; challenge_id: string; message: string }

export default function Profile() {
  const { user, setUser, meta } = useApp()
  const toast = useToast()
  const [theme, setTheme] = useTheme()
  const [name, setName] = useState(user?.name ?? '')
  const [programId, setProgramId] = useState(String(user?.program && !user.program.personal ? user.program.id : ''))
  const [saving, setSaving] = useState(false)
  const [permission, setPermission] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied')

  if (!user) return null
  const isStudent = user.role === 'student'

  const saveProfile = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { user: updated } = await patch<{ user: User }>('/api/auth/me', {
        name,
        program_id: programId ? Number(programId) : undefined,
      })
      setUser(updated)
      toast('success', 'Profile saved')
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <PageHead title="Profile & settings" lead="Your account, the link to my.sdu.edu.kz, and how Keste looks and notifies you." />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <div className="stack lg">
          <Card>
            <CardHead title="Account" icon={<UserRound />} />
            <div className="card-body">
              <div className="row" style={{ gap: 16, marginBottom: 18 }}>
                <div className="avatar lg">{initials(user.name)}</div>
                <div>
                  <h2 style={{ fontSize: 20 }}>{user.name}</h2>
                  <div className="row wrap" style={{ gap: 6, marginTop: 6 }}>
                    <Badge tone="dark">{user.role}</Badge>
                    {user.sdu_id && <Badge tone="info">SDU {user.sdu_id}</Badge>}
                    {user.department && <Badge tone="outline">{user.department.name}</Badge>}
                    {user.financial_hold && <Badge tone="danger">Financial hold</Badge>}
                  </div>
                </div>
              </div>
              <form className="stack" onSubmit={saveProfile}>
                <Field label="Display name">
                  <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
                </Field>
                {isStudent && (
                  <Field label="Degree programme" help={user.program?.personal ? 'You are using a personal curriculum (Degree Progress → Import).' : 'Used for the degree audit, recommendations and advisor routing.'}>
                    <select className="select" value={programId} onChange={(e) => setProgramId(e.target.value)}>
                      <option value="">Not selected</option>
                      {meta?.programs.map((p) => (
                        <option key={p.id} value={p.id}>{p.name}</option>
                      ))}
                    </select>
                  </Field>
                )}
                <div>
                  <Button variant="primary" loading={saving}>Save changes</Button>
                </div>
              </form>
            </div>
          </Card>

          <LoginMethods user={user} onUpdated={setUser} />
        </div>

        <div className="stack lg">
          {isStudent && <SduSync user={user} onUpdated={setUser} />}
          {isStudent && <PasteImport />}
          <Card>
            <CardHead title="Preferences" icon={<Palette />} />
            <div className="card-body stack lg">
              <div className="stack sm">
                <span className="field-label">Theme</span>
                <Segmented
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'system', label: 'System' },
                    { value: 'light', label: 'Light' },
                    { value: 'dark', label: 'Dark' },
                  ]}
                />
              </div>
              <div className="row between wrap">
                <div>
                  <div className="field-label row" style={{ gap: 6 }}><Bell size={14} /> Browser notifications</div>
                  <div className="muted" style={{ fontSize: 12.5 }}>Get seat alerts and waitlist updates even when this tab is in the background.</div>
                </div>
                {permission === 'granted' ? (
                  <Badge tone="success">Enabled</Badge>
                ) : (
                  <Button
                    size="sm"
                    disabled={permission === 'denied'}
                    onClick={async () => setPermission(await Notification.requestPermission())}
                  >
                    {permission === 'denied' ? 'Blocked in browser' : 'Enable'}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  )
}

function SduSync({ user, onUpdated }: { user: User; onUpdated: (u: User) => void }) {
  const toast = useToast()
  const [studentId, setStudentId] = useState(user.sdu_id ?? '')
  const [password, setPassword] = useState('')
  const [otp, setOtp] = useState<{ id: string; message: string } | null>(null)
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [summary, setSummary] = useState<SyncSummary | null>(null)

  const done = (result: Extract<SyncResult, { status: 'ok' }>) => {
    onUpdated(result.user)
    setSummary(result.sync)
    setOtp(null)
    toast('success', 'Synced with my.sdu.edu.kz')
  }

  const sync = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await post<SyncResult>('/api/auth/sdu/sync', { student_id: studentId || undefined, password })
      if (result.status === 'otp') setOtp({ id: result.challenge_id, message: result.message })
      else done(result)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sync failed')
    } finally {
      setBusy(false)
      setPassword('')
    }
  }

  const verify = async (e: FormEvent) => {
    e.preventDefault()
    if (!otp) return
    setBusy(true)
    setError(null)
    try {
      const result = await post<SyncResult>('/api/auth/sdu/otp', { challenge_id: otp.id, code })
      if (result.status === 'ok') done(result)
    } catch (err) {
      setError(errorText(err))
      setOtp(null)
    } finally {
      setBusy(false)
      setCode('')
    }
  }

  return (
    <Card>
      <CardHead
        title="my.sdu.edu.kz"
        icon={<RefreshCw />}
        action={user.sdu_id ? <Badge tone="success">Linked</Badge> : <Badge tone="outline">Not linked</Badge>}
      />
      <div className="card-body stack">
        <p className="muted" style={{ fontSize: 13.5 }}>
          {user.sdu_id
            ? `Last synced ${user.last_sdu_sync ? timeAgo(user.last_sdu_sync) : 'never'}. Re-sync after registration changes on the portal or when new grades are posted.`
            : 'Link your SDU account to import your current schedule, grades and transcript automatically.'}
        </p>
        {error && <Notice tone="danger">{error}</Notice>}
        {summary && (
          <Notice tone="success" title="Imported:">
            {summary.term ? `${summary.term} schedule · ` : ''}
            {summary.enrollments} new classes · {summary.transcript} transcript records · {summary.curriculum} curriculum courses
            {summary.warnings.length > 0 && <div className="muted" style={{ marginTop: 4 }}>{summary.warnings.join(' ')}</div>}
          </Notice>
        )}
        {otp ? (
          <form className="stack" onSubmit={verify}>
            <Notice>{otp.message}</Notice>
            <input className="input code" inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} maxLength={8} placeholder="••••••" autoFocus />
            <Button variant="primary" loading={busy} disabled={code.length < 4}>Verify</Button>
          </form>
        ) : (
          <form className="stack" onSubmit={sync}>
            {!user.sdu_id && (
              <Field label="Student ID">
                <input className="input" inputMode="numeric" value={studentId} onChange={(e) => setStudentId(e.target.value)} placeholder="230107001" required />
              </Field>
            )}
            <Field label="my.sdu password" help="Used once for this sync and never stored.">
              <input className="input" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            <div className="row">
              <Button variant="primary" icon={<RefreshCw />} loading={busy}>
                {user.sdu_id ? 'Sync now' : 'Link & import'}
              </Button>
              <span className="row muted" style={{ fontSize: 12, gap: 5 }}><ShieldCheck size={14} color="var(--success)" /> Encrypted, not saved</span>
            </div>
          </form>
        )}
      </div>
    </Card>
  )
}

function PasteImport() {
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<'curriculum' | 'schedule' | 'grades'>('curriculum')
  const [html, setHtml] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true)
    try {
      const result = await post<SyncSummary>('/api/sdu/import-html', { kind, html })
      toast('success', 'Imported from pasted page',
        kind === 'curriculum' ? `${result.curriculum} curriculum courses — see My courses` : `${result.enrollments} classes · ${result.transcript} transcript records`)
      setHtml('')
      setOpen(false)
    } catch (e) {
      toast('error', 'Import failed', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead title="Manual import" icon={<ClipboardPaste />} action={<Button size="sm" variant="ghost" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'}</Button>} />
      <div className="card-body stack">
        <p className="muted" style={{ fontSize: 13.5 }}>
          If the portal asks for something the automatic sync can't handle, open your schedule or transcript on my.sdu.edu.kz, press{' '}
          <span className="kbd">Ctrl</span>+<span className="kbd">U</span> (view source), copy everything and paste it here.
        </p>
        {open && (
          <>
            <Segmented value={kind} onChange={setKind} options={[{ value: 'curriculum', label: 'My Curriculum' }, { value: 'schedule', label: 'Schedule' }, { value: 'grades', label: 'Grades / transcript' }]} />
            <textarea className="textarea mono" style={{ minHeight: 140, fontSize: 12 }} value={html} onChange={(e) => setHtml(e.target.value)} placeholder="<html>…" />
            <div>
              <Button variant="primary" loading={busy} disabled={html.length < 20} onClick={submit}>Import</Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}

function LoginMethods({ user, onUpdated }: { user: User; onUpdated: (u: User) => void }) {
  const toast = useToast()
  const [email, setEmail] = useState(user.email ?? '')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e: FormEvent) => {
    e.preventDefault()
    setBusy(true)
    try {
      const { user: updated } = await patch<{ user: User }>('/api/auth/me', { email, password: password || undefined })
      onUpdated(updated)
      setPassword('')
      toast('success', 'Sign-in details saved')
    } catch (err) {
      toast('error', errorText(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead title="E-mail sign-in" icon={<KeyRound />} action={user.has_password ? <Badge tone="success">Enabled</Badge> : <Badge tone="outline">Off</Badge>} />
      <form className="card-body stack" onSubmit={save}>
        <p className="muted" style={{ fontSize: 13.5 }}>
          {user.sdu_id
            ? 'Optional: add an e-mail and password to sign in even when my.sdu.edu.kz is down, and to receive e-mail notifications.'
            : 'Your e-mail is used for sign-in, password reset and notifications.'}
        </p>
        <Field label="E-mail">
          <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" />
        </Field>
        <Field label={user.has_password ? 'New password' : 'Password'} help="At least 8 characters. Leave empty to keep the current one.">
          <input className="input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div>
          <Button loading={busy} disabled={!email}>Save sign-in details</Button>
        </div>
      </form>
    </Card>
  )
}
