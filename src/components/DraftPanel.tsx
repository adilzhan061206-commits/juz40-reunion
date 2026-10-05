import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CalendarDays, CheckCircle2, ShoppingBag, Trash2, XCircle } from 'lucide-react'
import { Badge, Button, Card, CardHead, Modal, Notice } from './ui'
import RequestModal from './RequestModal'
import { useToast } from '../context/app'
import { del, errorText, post } from '../lib/api'
import { celebrate } from '../lib/celebrate'
import { courseColor, kindLabel, meetingText } from '../lib/format'
import type { ScheduleState } from '../lib/types'

interface SubmitResult {
  results: { section_id: number; label: string; ok: boolean; code?: string; message: string; requested_ects?: number }[]
  schedule: ScheduleState
}

export default function DraftPanel({
  state,
  onChange,
}: {
  state: ScheduleState | undefined
  onChange: (state: ScheduleState) => void
}) {
  const toast = useToast()
  const [busy, setBusy] = useState(false)
  const [results, setResults] = useState<SubmitResult['results'] | null>(null)
  const [overload, setOverload] = useState<number | null>(null)

  if (!state) return <Card pad><div className="skeleton" style={{ height: 180 }} /></Card>

  const over = state.ects.with_cart > state.ects.limit
  const pct = Math.min(100, (state.ects.with_cart / state.ects.limit) * 100)
  const enrolledPct = Math.min(100, (state.ects.enrolled / state.ects.limit) * 100)

  const remove = async (id: number) => {
    try {
      onChange(await del<ScheduleState>(`/api/cart/${id}`))
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const submit = async () => {
    setBusy(true)
    try {
      const data = await post<SubmitResult>('/api/registration/submit', { term_id: state.term.id })
      onChange(data.schedule)
      setResults(data.results)
      const ok = data.results.filter((r) => r.ok).length
      if (ok && ok === data.results.length) celebrate()
    } catch (e) {
      toast('error', 'Registration failed', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHead title="Schedule draft" icon={<ShoppingBag />} action={<Badge tone="outline">{state.term.name}</Badge>} />
      <div className="card-body stack">
        <div className="meter">
          <div className="row between">
            <span style={{ fontWeight: 600 }}>Credit load</span>
            <span className={over ? '' : 'muted'} style={over ? { color: 'var(--danger)', fontWeight: 700 } : undefined}>
              {state.ects.with_cart} / {state.ects.limit} ECTS
            </span>
          </div>
          <div className="progress lg">
            <i className="done" style={{ width: `${enrolledPct}%` }} />
            <i className="wip" style={{ width: `${Math.max(0, pct - enrolledPct)}%`, background: over ? 'var(--danger)' : undefined }} />
          </div>
          <div className="legend">
            <span><i style={{ background: 'var(--success)' }} /> Registered {state.ects.enrolled}</span>
            <span><i style={{ background: 'var(--accent)' }} /> In draft {Math.round((state.ects.with_cart - state.ects.enrolled) * 10) / 10}</span>
          </div>
        </div>

        {state.financial_hold && (
          <Notice tone="danger" title="Financial hold.">
            Registration is blocked until the hold is resolved with the Finance Office.
          </Notice>
        )}
        {over && (
          <Notice tone="warning">
            Above the {state.ects.limit} ECTS limit.{' '}
            <button className="link" onClick={() => setOverload(Math.ceil(state.ects.with_cart))}>
              Request an overload
            </button>
          </Notice>
        )}
        {state.conflicts.length > 0 && (
          <Notice tone="danger">
            {state.conflicts.length} time conflict{state.conflicts.length > 1 ? 's' : ''} in your draft.{' '}
            <Link to="/schedule" className="link">Resolve</Link>
          </Notice>
        )}

        {state.cart.length === 0 ? (
          <p className="muted" style={{ fontSize: 13 }}>
            Your draft is empty. Add sections from the catalogue or let the{' '}
            <Link to="/generator" className="link">Auto Scheduler</Link> pick them for you.
          </p>
        ) : (
          <div>
            {state.cart.map((s) => (
              <div key={s.id} className="draft-item">
                <span className="color-dot" style={{ background: courseColor(s.course.code) }} />
                <div className="grow">
                  <div style={{ fontWeight: 620, fontSize: 13.5 }}>
                    {s.course.code} <span className="muted">· {kindLabel(s.kind)} {s.code}</span>
                  </div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {s.meetings.map(meetingText).join(', ')}
                  </div>
                  {s.prerequisite.blocked && (
                    <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 2 }}>{s.prerequisite.message}</div>
                  )}
                </div>
                <button className="btn ghost sm icon" onClick={() => remove(s.id)} aria-label="Remove from draft">
                  <Trash2 />
                </button>
              </div>
            ))}
          </div>
        )}

        <Button variant="accent" block size="lg" loading={busy} disabled={!state.cart.length || !state.term.registration_open} onClick={submit}>
          Register {state.cart.length ? `${state.cart.length} section${state.cart.length > 1 ? 's' : ''}` : ''}
        </Button>
        <Link to="/schedule">
          <Button block variant="ghost" icon={<CalendarDays />}>
            View weekly grid
          </Button>
        </Link>
      </div>

      {results && (
        <Modal
          title={results.every((r) => r.ok) ? 'You are registered!' : 'Registration results'}
          subtitle={`${results.filter((r) => r.ok).length} of ${results.length} sections registered for ${state.term.name}.`}
          onClose={() => setResults(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setResults(null)}>Close</Button>
              <Link to="/schedule"><Button variant="primary">Open my schedule</Button></Link>
            </>
          }
        >
          <div className="stack">
            {results.map((r) => (
              <div key={r.section_id} className="row" style={{ alignItems: 'flex-start' }}>
                {r.ok ? <CheckCircle2 size={18} color="var(--success)" /> : r.code === 'full' ? <AlertTriangle size={18} color="var(--warning)" /> : <XCircle size={18} color="var(--danger)" />}
                <div className="grow">
                  <b style={{ fontSize: 13.5 }}>{r.label}</b>
                  <div className="muted" style={{ fontSize: 12.5 }}>{r.message}</div>
                  {r.code === 'credit_limit' && (
                    <button className="link" style={{ fontSize: 12.5 }} onClick={() => { setResults(null); setOverload(Math.ceil(r.requested_ects ?? 45)) }}>
                      Request a credit overload →
                    </button>
                  )}
                  {r.code === 'full' && (
                    <span className="muted" style={{ fontSize: 12.5 }}>Join the waitlist from the catalogue to get the next seat.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Modal>
      )}
      {overload !== null && (
        <RequestModal kind="credit_overload" termId={state.term.id} suggestedEcts={overload} onClose={() => setOverload(null)} />
      )}
    </Card>
  )
}
