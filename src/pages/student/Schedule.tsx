import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRightLeft,
  CalendarCheck,
  CalendarPlus,
  Copy,
  Download,
  Link2,
  LogOut,
  Replace,
  Undo2,
} from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, LoadingCards, Modal, Notice, PageHead, SeatMeter } from '../../components/ui'
import WeekGrid from '../../components/WeekGrid'
import { toGridItems } from '../../lib/grid'
import DraftPanel from '../../components/DraftPanel'
import { useApp, useToast } from '../../context/app'
import { celebrate } from '../../lib/celebrate'
import { ApiError, del, errorText, get, post } from '../../lib/api'
import { courseColor, dateText, ects, kindLabel, meetingText } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { ScheduleState, SectionT } from '../../lib/types'

interface SwapOptions {
  current: SectionT
  options: (SectionT & { conflicts_with: string[]; available: boolean })[]
}

export default function Schedule() {
  const { termId } = useApp()
  const toast = useToast()
  const { data, error, loading, reload, setData } = useAsync(() => get<ScheduleState>(`/api/schedule?term_id=${termId ?? ''}`), [termId])
  const [swapFor, setSwapFor] = useState<SectionT | null>(null)
  const [dropFor, setDropFor] = useState<SectionT | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [feed, setFeed] = useState<string | null>(null)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !data) return <LoadingCards count={2} height={260} />
  if (!data) return null

  const conflictIds = new Set(data.conflicts.flatMap((c) => c.section_ids))
  const enrolledIds = new Set(data.enrolled.map((s) => s.id))
  const items = [
    ...toGridItems(data.enrolled).map((i) => ({ ...i, conflict: conflictIds.has(Number(i.key)) })),
    ...toGridItems(data.cart.filter((s) => !enrolledIds.has(s.id)), { draft: true }).map((i) => ({
      ...i,
      conflict: conflictIds.has(Number(i.key)),
    })),
  ]
  const confirmed = !!data.confirmed_at

  const run = async (key: string, fn: () => Promise<ScheduleState | { schedule: ScheduleState; message?: string }>, success?: string) => {
    setBusy(key)
    try {
      const result = await fn()
      if ('term' in result) setData(result)
      else {
        setData(result.schedule)
        if (result.message) toast('success', result.message)
      }
      if (success) toast('success', success)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const replace = (fromId: number, toId: number, inCart: boolean) =>
    run(`replace-${toId}`, () =>
      inCart
        ? post<ScheduleState>('/api/cart/replace', { from_section_id: fromId, to_section_id: toId })
        : post<{ schedule: ScheduleState; message: string }>('/api/enrollments/swap', { from_section_id: fromId, to_section_id: toId }),
    )

  const exportIcs = async () => {
    setBusy('export')
    try {
      const response = await fetch(`/api/schedule/export.ics?term_id=${data.term.id}`, { credentials: 'same-origin' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new ApiError(response.status, body.detail ?? 'Export failed')
      }
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `sdu-schedule-${data.term.code}.ics`
      a.click()
      URL.revokeObjectURL(url)
      toast('success', 'Schedule exported', 'Open the .ics file to add every class to Google, Apple or Outlook Calendar.')
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const subscribe = async () => {
    try {
      const { url } = await post<{ url: string }>('/api/calendar/subscription')
      setFeed(url)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <PageHead
        eyebrow={data.term.name}
        title="Register & confirm"
        lead="Step 3 of 3. Draft sections are dashed — press Register to enroll, then confirm the schedule and export it to your calendar. Overlaps are striped red with one-click fixes."
        actions={
          <>
            {confirmed ? (
              <Badge tone="success" icon={<CalendarCheck />}>Confirmed {dateText(data.confirmed_at!)}</Badge>
            ) : (
              <Badge tone="warning">Not confirmed</Badge>
            )}
            {confirmed ? (
              <Button variant="ghost" icon={<Undo2 />} loading={busy === 'unconfirm'} onClick={() => run('unconfirm', () => del<ScheduleState>(`/api/schedule/confirm?term_id=${data.term.id}`))}>
                Edit
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={<CalendarCheck />}
                disabled={!data.enrolled.length || data.conflicts.some((c) => c.section_ids.every((id) => enrolledIds.has(id)))}
                loading={busy === 'confirm'}
                onClick={async () => {
                  await run('confirm', () => post<ScheduleState>('/api/schedule/confirm', { term_id: data.term.id }), 'Schedule confirmed')
                  celebrate()
                }}
              >
                Confirm schedule
              </Button>
            )}
            <Button icon={<Download />} loading={busy === 'export'} onClick={exportIcs}>
              Export .ics
            </Button>
          </>
        }
      />

      <div className="split">
        <div className="stack lg">
          {data.conflicts.map((c) => (
            <Card key={c.section_ids.join('-')} className="conflict-card">
              <div className="card-body stack">
                <Notice tone="danger" title="Time conflict:">
                  {c.message}
                </Notice>
                {c.suggestions.length ? (
                  <div className="stack sm">
                    <span className="eyebrow">Open alternatives that fit</span>
                    <div className="grid cols-2" style={{ gap: 10 }}>
                      {c.suggestions.map((sg) => (
                        <div key={`${sg.replace_id}-${sg.section.id}`} className="selected-course" style={{ alignItems: 'flex-start' }}>
                          <span className="color-dot" style={{ background: courseColor(sg.section.course.code), marginTop: 4 }} />
                          <div className="grow">
                            <b style={{ fontSize: 13 }}>
                              {sg.section.course.code} · {kindLabel(sg.section.kind)} {sg.section.code}
                            </b>
                            <div className="muted" style={{ fontSize: 12 }}>
                              {sg.section.meetings.map(meetingText).join(', ')} · {sg.section.seats_left} seats
                            </div>
                          </div>
                          <Button size="sm" variant="accent" icon={<Replace />} loading={busy === `replace-${sg.section.id}`} onClick={() => replace(sg.replace_id, sg.section.id, sg.in_cart)}>
                            Replace
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="muted" style={{ fontSize: 13 }}>
                    No open section fits right now. Remove one of the courses or try the <Link to="/generator" className="link">Auto Scheduler</Link>.
                  </p>
                )}
              </div>
            </Card>
          ))}

          <WeekGrid items={items} emptyText="Nothing registered yet — add sections from Course Registration" />

          <Card>
            <CardHead title="Registered courses" icon={<CalendarCheck />} action={<Badge tone="outline">{ects(data.ects.enrolled)}</Badge>} />
            {data.enrolled.length === 0 ? (
              <Empty icon={<CalendarPlus />} title="No registered courses" action={<Link to="/registration"><Button variant="primary">Browse courses</Button></Link>}>
                Build a draft and press Register — or let the Auto Scheduler do it.
              </Empty>
            ) : (
              <div className="scroll-x" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Course</th>
                      <th>Section</th>
                      <th>When & where</th>
                      <th className="hide-sm">Seats</th>
                      <th style={{ textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.enrolled.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <div className="row" style={{ gap: 9 }}>
                            <span className="color-dot" style={{ background: courseColor(s.course.code) }} />
                            <div>
                              <b className="mono" style={{ fontSize: 12.5 }}>{s.course.code}</b>
                              <div style={{ fontSize: 13 }}>{s.course.title}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="kind-label">{kindLabel(s.kind)}</span>
                          <div className="mono" style={{ fontWeight: 650 }}>{s.code}</div>
                        </td>
                        <td>
                          <div className="times">
                            {s.meetings.map((m, i) => (
                              <span key={i}>
                                {meetingText(m)} {m.room && <span className="muted">· {m.room}</span>}
                              </span>
                            ))}
                            {conflictIds.has(s.id) && (
                              <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>
                                <AlertTriangle size={12} /> Conflict
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="hide-sm">
                          <SeatMeter left={s.seats_left} capacity={s.capacity} />
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                            <Button size="sm" icon={<ArrowRightLeft />} onClick={() => setSwapFor(s)} disabled={!data.term.registration_open}>
                              Swap
                            </Button>
                            <Button size="sm" variant="danger" icon={<LogOut />} onClick={() => setDropFor(s)} disabled={!data.term.registration_open}>
                              Drop
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHead title="Calendar" icon={<CalendarPlus />} />
            <div className="card-body stack">
              {!confirmed && (
                <Notice tone="warning">Schedule must be fully confirmed before export. Confirm it above once you are happy with it.</Notice>
              )}
              <p className="muted" style={{ fontSize: 13.5 }}>
                Download an .ics file, or subscribe once and your calendar app keeps the confirmed schedule up to date —
                course name, time, and room included.
              </p>
              <div className="row wrap">
                <Button icon={<Download />} onClick={exportIcs} loading={busy === 'export'} disabled={!confirmed}>
                  Download .ics
                </Button>
                <Button variant="ghost" icon={<Link2 />} onClick={subscribe} disabled={!confirmed}>
                  Get subscription link
                </Button>
              </div>
              {feed && (
                <div className="row">
                  <input className="input mono" readOnly value={feed} onFocus={(e) => e.target.select()} style={{ fontSize: 12 }} />
                  <Button
                    icon={<Copy />}
                    onClick={() => navigator.clipboard?.writeText(feed).then(() => toast('success', 'Link copied', 'Paste it into Google Calendar → Other calendars → From URL.'))}
                  />
                </div>
              )}
            </div>
          </Card>
        </div>

        <div className="sticky">
          <DraftPanel state={data} onChange={setData} />
        </div>
      </div>

      {swapFor && (
        <SwapModal
          section={swapFor}
          onClose={() => setSwapFor(null)}
          onSwapped={(state, message) => {
            setData(state)
            setSwapFor(null)
            toast('success', 'Section swapped', message)
          }}
        />
      )}
      {dropFor && (
        <Modal
          title={`Drop ${dropFor.course.code}?`}
          subtitle={`You will lose your seat in ${kindLabel(dropFor.kind)} ${dropFor.code}. If there is a waitlist, the next student is enrolled immediately. To change sections without losing your seat, use Swap instead.`}
          onClose={() => setDropFor(null)}
          footer={
            <>
              <Button variant="ghost" onClick={() => setDropFor(null)}>Keep it</Button>
              <Button
                variant="danger"
                loading={busy === 'drop'}
                onClick={async () => {
                  await run('drop', () => post<ScheduleState>(`/api/enrollments/${dropFor.id}/drop`), `${dropFor.course.code} dropped`)
                  setDropFor(null)
                }}
              >
                Drop section
              </Button>
            </>
          }
        >
          <span />
        </Modal>
      )}
    </>
  )
}

function SwapModal({
  section,
  onClose,
  onSwapped,
}: {
  section: SectionT
  onClose: () => void
  onSwapped: (state: ScheduleState, message: string) => void
}) {
  const { data, error, loading } = useAsync(() => get<SwapOptions>(`/api/enrollments/${section.id}/swap-options`), [section.id])
  const [target, setTarget] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  const confirm = async () => {
    if (!target) return
    setBusy(true)
    setFailure(null)
    try {
      const result = await post<{ schedule: ScheduleState; message: string }>('/api/enrollments/swap', {
        from_section_id: section.id,
        to_section_id: target,
      })
      onSwapped(result.schedule, result.message)
    } catch (e) {
      setFailure(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      wide
      title={`Swap ${section.course.code} ${kindLabel(section.kind).toLowerCase()}`}
      subtitle="The swap is atomic: you are moved to the new section and released from the old one in one step — or nothing changes."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<ArrowRightLeft />} disabled={!target} loading={busy} onClick={confirm}>
            Confirm swap
          </Button>
        </>
      }
    >
      <div className="stack">
        <div className="selected-course">
          <span className="eyebrow">Current</span>
          <b className="mono">{section.code}</b>
          <span className="muted" style={{ fontSize: 12.5 }}>{section.meetings.map(meetingText).join(', ')}</span>
        </div>
        {failure && <Notice tone="danger">{failure}. You are still registered in section {section.code}.</Notice>}
        {error && <Notice tone="danger">{error}</Notice>}
        {loading && !data ? (
          <LoadingCards count={2} height={52} />
        ) : data && data.options.length === 0 ? (
          <p className="muted">There are no other {kindLabel(section.kind).toLowerCase()} sections for this course.</p>
        ) : (
          <div className="stack sm">
            {data?.options.map((o) => (
              <label
                key={o.id}
                className="selected-course"
                style={{ cursor: o.available ? 'pointer' : 'not-allowed', opacity: o.available ? 1 : 0.55, borderColor: target === o.id ? 'var(--accent-strong)' : undefined }}
              >
                <input type="radio" name="swap" disabled={!o.available} checked={target === o.id} onChange={() => setTarget(o.id)} />
                <b className="mono">{o.code}</b>
                <div className="grow">
                  <div style={{ fontSize: 13 }}>{o.meetings.map(meetingText).join(', ')}</div>
                  <div className="muted" style={{ fontSize: 12 }}>
                    {o.instructor ?? 'Instructor TBA'}
                    {o.conflicts_with.length > 0 && <span style={{ color: 'var(--danger)' }}> · clashes with {o.conflicts_with.join(', ')}</span>}
                  </div>
                </div>
                <SeatMeter left={o.seats_left} capacity={o.capacity} />
              </label>
            ))}
          </div>
        )}
      </div>
    </Modal>
  )
}
