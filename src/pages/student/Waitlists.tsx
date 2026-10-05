import { Link } from 'react-router-dom'
import { BellOff, BellRing, Hourglass } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, LoadingCards, PageHead, SeatMeter } from '../../components/ui'
import { useToast } from '../../context/app'
import { del, errorText, get } from '../../lib/api'
import { courseColor, dateText, kindLabel, meetingText, timeAgo } from '../../lib/format'
import { useAsync, useInterval } from '../../lib/hooks'
import type { AlertT, WaitlistEntryT } from '../../lib/types'

const STATUS: Record<WaitlistEntryT['status'], { tone: 'success' | 'danger' | 'warning' | 'info' | 'outline'; label: string }> = {
  waiting: { tone: 'info', label: 'Waiting' },
  held: { tone: 'danger', label: 'Hold — action needed' },
  enrolled: { tone: 'success', label: 'Enrolled' },
  skipped: { tone: 'warning', label: 'Skipped' },
  cancelled: { tone: 'outline', label: 'Left' },
  expired: { tone: 'outline', label: 'Expired' },
}

export default function Waitlists() {
  const toast = useToast()
  const waitlist = useAsync(() => get<{ entries: WaitlistEntryT[] }>('/api/waitlist'), [])
  const alerts = useAsync(() => get<{ alerts: AlertT[]; limit: number }>('/api/alerts'), [])
  useInterval(() => {
    void waitlist.reload()
    void alerts.reload()
  }, 20000)

  if (waitlist.error) return <ErrorState message={waitlist.error} onRetry={waitlist.reload} />
  const active = (waitlist.data?.entries ?? []).filter((e) => e.status === 'waiting' || e.status === 'held')
  const history = (waitlist.data?.entries ?? []).filter((e) => e.status !== 'waiting' && e.status !== 'held')

  const remove = async (path: string, message: string) => {
    try {
      await del(path)
      toast('success', message)
      void waitlist.reload()
      void alerts.reload()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <PageHead
        title="Waitlists & seat alerts"
        lead="When a seat opens, the first eligible student on the waitlist is enrolled automatically — conflicts and account holds are checked first. Seat alerts notify you the moment a full section opens up."
      />
      <div className="grid cols-2" style={{ alignItems: 'start' }}>
        <Card>
          <CardHead title="My waitlists" icon={<Hourglass />} action={<Badge tone="outline">{active.length} active</Badge>} />
          {waitlist.loading && !waitlist.data ? (
            <div className="card-body"><LoadingCards count={2} height={70} /></div>
          ) : !waitlist.data?.entries.length ? (
            <Empty icon={<Hourglass />} title="Not on any waitlist" action={<Link to="/registration"><Button>Find full sections</Button></Link>}>
              Join a waitlist from Course Registration when a section is full.
            </Empty>
          ) : (
            <div className="list" style={{ marginTop: 8 }}>
              {[...active, ...history].map((e) => {
                const s = STATUS[e.status]
                return (
                  <div key={e.id} className="item" style={{ alignItems: 'flex-start', opacity: e.status === 'cancelled' || e.status === 'expired' ? 0.6 : 1 }}>
                    <div className="match" style={{ width: 52, height: 52, fontSize: 18, borderRadius: 14, background: e.position ? 'var(--info-soft)' : 'var(--surface-2)', color: e.position ? 'var(--info)' : 'var(--muted)' }}>
                      <div>{e.position ? `#${e.position}` : '—'}<small>{e.position ? 'IN LINE' : ''}</small></div>
                    </div>
                    <div className="grow">
                      <div className="row wrap" style={{ gap: 6 }}>
                        <b style={{ fontSize: 13.5 }}>{e.section.course.code} · {kindLabel(e.section.kind)} {e.section.code}</b>
                        <Badge tone={s.tone}>{s.label}</Badge>
                      </div>
                      <div className="muted" style={{ fontSize: 12.5 }}>{e.section.course.title} · {e.section.meetings.map(meetingText).join(', ')}</div>
                      {e.note && <div style={{ fontSize: 12.5, marginTop: 4 }}>{e.note}</div>}
                      {e.status === 'held' && e.hold_deadline && (
                        <div style={{ fontSize: 12.5, color: 'var(--danger)', marginTop: 4 }}>Resolve your hold before {dateText(e.hold_deadline)} to keep your place.</div>
                      )}
                      <div className="faint" style={{ fontSize: 11.5, marginTop: 4 }}>Joined {timeAgo(e.created_at)}</div>
                    </div>
                    {(e.status === 'waiting' || e.status === 'held') && (
                      <Button size="sm" variant="ghost" onClick={() => remove(`/api/waitlist/${e.id}`, 'Left the waitlist')}>Leave</Button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </Card>

        <Card>
          <CardHead title="Seat alerts" icon={<BellRing />} action={<Badge tone="outline">{alerts.data?.alerts.length ?? 0} / {alerts.data?.limit ?? 5}</Badge>} />
          {alerts.loading && !alerts.data ? (
            <div className="card-body"><LoadingCards count={2} height={70} /></div>
          ) : !alerts.data?.alerts.length ? (
            <Empty icon={<BellRing />} title="No seat alerts">
              Tap the bell next to a full section to get notified the moment a seat opens.
            </Empty>
          ) : (
            <div className="list" style={{ marginTop: 8 }}>
              {alerts.data.alerts.map((a) => (
                <div key={a.id} className="item">
                  <span className="color-dot" style={{ background: courseColor(a.section.course.code) }} />
                  <div className="grow">
                    <b style={{ fontSize: 13.5 }}>{a.section.course.code} · {kindLabel(a.section.kind)} {a.section.code}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {a.channels.map((c) => c.toUpperCase()).join(' · ')}
                      {a.last_notified_at ? ` · last alert ${timeAgo(a.last_notified_at)}` : ''}
                    </div>
                  </div>
                  <SeatMeter left={a.section.seats_left} capacity={a.section.capacity} />
                  <Button size="sm" variant="ghost" icon={<BellOff />} onClick={() => remove(`/api/alerts/${a.id}`, 'Alert removed')} aria-label="Remove alert" />
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  )
}
