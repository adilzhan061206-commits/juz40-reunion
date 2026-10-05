import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  AlertTriangle,
  Bell,
  BellRing,
  Check,
  ChevronDown,
  Hourglass,
  Lock,
  Plus,
  Search,
  SearchX,
  ShieldQuestion,
} from 'lucide-react'
import { Badge, Button, Empty, ErrorState, LoadingCards, Modal, Notice, PageHead, PrereqBadge, SeatMeter } from '../../components/ui'
import DraftPanel from '../../components/DraftPanel'
import RequestModal from '../../components/RequestModal'
import { useApp, useToast } from '../../context/app'
import { del, errorText, get, post } from '../../lib/api'
import { courseColor, ects, kindLabel, meetingText } from '../../lib/format'
import { useAsync, useDebounced } from '../../lib/hooks'
import type { CatalogCourse, CatalogSection, ScheduleState, Term } from '../../lib/types'

interface CatalogData {
  term: Term
  courses: CatalogCourse[]
}

export default function Registration() {
  const { termId, meta } = useApp()
  const toast = useToast()
  const [params] = useSearchParams()
  const [query, setQuery] = useState(params.get('course') ?? '')
  const [department, setDepartment] = useState('')
  const [onlyOpen, setOnlyOpen] = useState(false)
  const [hideDone, setHideDone] = useState(true)
  const [chosen, setExpanded] = useState<number | null | undefined>(undefined)
  const [waiver, setWaiver] = useState<CatalogCourse | null>(null)
  const [alertFor, setAlertFor] = useState<{ section: CatalogSection; course: CatalogCourse } | null>(null)
  const [busy, setBusy] = useState<number | null>(null)
  const q = useDebounced(query, 200)

  const catalog = useAsync(
    () => get<CatalogData>(`/api/catalog?term_id=${termId ?? ''}&q=${encodeURIComponent(q)}&department=${department}&only_open=${onlyOpen}`),
    [termId, q, department, onlyOpen],
  )
  const schedule = useAsync(() => get<ScheduleState>(`/api/schedule?term_id=${termId ?? ''}`), [termId])

  const courses = useMemo(
    () => (catalog.data?.courses ?? []).filter((c) => !hideDone || !c.completed),
    [catalog.data, hideDone],
  )

  // Until the student opens a course themselves, expand the one linked via ?course=CODE.
  const linked = catalog.data?.courses.find((c) => c.code === params.get('course'))?.id ?? null
  const expanded = chosen === undefined ? linked : chosen

  const refresh = async (state?: ScheduleState) => {
    if (state) schedule.setData(state)
    else await schedule.reload()
    await catalog.reload()
  }

  const act = async (sectionId: number, fn: () => Promise<unknown>, success?: string) => {
    setBusy(sectionId)
    try {
      const result = await fn()
      if (success) toast('success', success)
      await refresh(result && typeof result === 'object' && 'cart' in result ? (result as ScheduleState) : undefined)
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(null)
    }
  }

  const term = catalog.data?.term

  return (
    <>
      <PageHead
        eyebrow={term ? `${term.name} · ${term.registration_open ? 'Registration open' : 'Registration closed'}` : undefined}
        title="Course catalogue"
        lead="Browse every section offered this term. Prerequisites are checked instantly against your SDU transcript, and full sections can be waitlisted or watched for seat alerts."
      />

      <div className="split">
        <div className="stack">
          <div className="card pad" style={{ padding: 14 }}>
            <div className="row wrap" style={{ gap: 12 }}>
              <div className="input-icon grow" style={{ minWidth: 220 }}>
                <Search />
                <input
                  className="input"
                  placeholder="Search by code, title or instructor — e.g. CSS 222"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Open seats only
              </label>
              <label className="checkbox">
                <input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide completed
              </label>
            </div>
            <div className="chips" style={{ marginTop: 12 }}>
              <button className={`chip ${department === '' ? 'on' : ''}`} onClick={() => setDepartment('')}>
                All departments
              </button>
              {meta?.departments.map((d) => (
                <button key={d.id} className={`chip ${department === d.code ? 'on' : ''}`} onClick={() => setDepartment(d.code)}>
                  {d.name}
                </button>
              ))}
            </div>
          </div>

          {term && !term.registration_open && (
            <Notice tone="warning">Registration for {term.name} is closed. You can still browse sections and plan ahead.</Notice>
          )}

          {catalog.error ? (
            <ErrorState message={catalog.error} onRetry={catalog.reload} />
          ) : catalog.loading && !catalog.data ? (
            <LoadingCards count={6} height={74} />
          ) : courses.length === 0 ? (
            <div className="card">
              <Empty icon={<SearchX />} title="No courses match">
                Try a different search or clear the filters.
              </Empty>
            </div>
          ) : (
            <div className="stack" style={{ gap: 10 }}>
              <div className="muted" style={{ fontSize: 12.5 }}>
                {courses.length} course{courses.length === 1 ? '' : 's'} · {courses.reduce((n, c) => n + c.sections.length, 0)} sections
              </div>
              {courses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  open={expanded === course.id}
                  busy={busy}
                  onToggle={() => setExpanded(expanded === course.id ? null : course.id)}
                  onAdd={(s) => act(s.id, () => post('/api/cart', { section_id: s.id }), `${course.code} ${s.code} added to your draft`)}
                  onRemove={(s) => act(s.id, () => del(`/api/cart/${s.id}`))}
                  onWaitlist={(s) => act(s.id, () => post('/api/waitlist', { section_id: s.id }), `You joined the waitlist for ${course.code} ${s.code}`)}
                  onAlert={(s) => setAlertFor({ section: s, course })}
                  onWaiver={() => setWaiver(course)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="sticky">
          <DraftPanel state={schedule.data} onChange={(s) => refresh(s)} />
        </div>
      </div>

      {waiver && (
        <RequestModal kind="prerequisite_waiver" termId={termId} course={waiver} onClose={() => setWaiver(null)} />
      )}
      {alertFor && (
        <AlertModal
          course={alertFor.course}
          section={alertFor.section}
          onClose={() => setAlertFor(null)}
          onDone={() => {
            setAlertFor(null)
            void catalog.reload()
          }}
        />
      )}
    </>
  )
}

function CourseCard({
  course,
  open,
  busy,
  onToggle,
  onAdd,
  onRemove,
  onWaitlist,
  onAlert,
  onWaiver,
}: {
  course: CatalogCourse
  open: boolean
  busy: number | null
  onToggle: () => void
  onAdd: (s: CatalogSection) => void
  onRemove: (s: CatalogSection) => void
  onWaitlist: (s: CatalogSection) => void
  onAlert: (s: CatalogSection) => void
  onWaiver: () => void
}) {
  const check = course.prerequisite_check
  const blocked = !!check?.blocked
  const inCart = course.sections.some((s) => s.in_cart)
  const registered = course.sections.some((s) => s.enrolled_here)
  const open_seats = course.sections.reduce((n, s) => n + s.seats_left, 0)
  const kinds = ['lecture', 'practice', 'lab'].filter((k) => course.sections.some((s) => s.kind === k))

  return (
    <div className={`course-card ${open ? 'open' : ''} ${blocked ? 'blocked' : ''}`}>
      <button className="course-top" onClick={onToggle} aria-expanded={open}>
        <span className="color-dot" style={{ background: courseColor(course.code), width: 12, height: 40, borderRadius: 6 }} />
        <div className="grow">
          <div className="row wrap" style={{ gap: 8 }}>
            <span className="code-tag">{course.code}</span>
            <span className="title">{course.title}</span>
          </div>
          <div className="meta">
            <span>{ects(course.ects)}</span>
            <span>{course.credits} cr</span>
            {course.hours && <span>Hours {course.hours}</span>}
            <span>{course.sections.length} sections</span>
            <span style={{ color: open_seats ? undefined : 'var(--danger)', fontWeight: open_seats ? undefined : 650 }}>
              {open_seats ? `${open_seats} open seats` : 'All sections full'}
            </span>
          </div>
        </div>
        <div className="row wrap hide-sm" style={{ justifyContent: 'flex-end', gap: 6, maxWidth: 320 }}>
          {course.completed && <Badge tone="success" icon={<Check />}>Completed</Badge>}
          {course.in_progress && !course.completed && <Badge tone="warning">In progress</Badge>}
          {registered && <Badge tone="dark" icon={<Check />}>Registered</Badge>}
          {inCart && !registered && <Badge tone="accent">In draft</Badge>}
          <PrereqBadge check={check} />
        </div>
        <ChevronDown className="chev" />
      </button>

      {open && (
        <div className="course-sections">
          <div style={{ padding: '14px 18px 4px' }} className="stack sm">
            {course.description && <p className="muted" style={{ fontSize: 13.5 }}>{course.description}</p>}
            {course.prerequisites.length > 0 && (
              <div className="row wrap" style={{ gap: 6, fontSize: 12.5 }}>
                <span className="muted">Requires:</span>
                {course.prerequisites.map((p) => (
                  <span key={p.code} className="code-tag" title={p.title}>
                    {p.code}
                    {p.kind === 'co' ? ' (co-req)' : ''}
                  </span>
                ))}
              </div>
            )}
            {blocked && (
              <Notice tone="danger" title={check?.message}>
                The Add button stays disabled until the prerequisite is completed with C or higher.{' '}
                <button className="link" onClick={onWaiver}>
                  <ShieldQuestion size={13} style={{ verticalAlign: '-2px' }} /> Request a waiver from your advisor
                </button>
              </Notice>
            )}
          </div>
          <div className="scroll-x">
            <table className="table">
              <thead>
                <tr>
                  <th>Section</th>
                  <th>Schedule</th>
                  <th className="hide-sm">Instructor</th>
                  <th>Seats</th>
                  <th style={{ textAlign: 'right' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {kinds.map((kind) =>
                  course.sections
                    .filter((s) => s.kind === kind)
                    .map((s, i) => (
                      <tr key={s.id} className={s.in_cart || s.enrolled_here ? 'hl' : ''}>
                        <td>
                          {i === 0 && <div className="kind-label">{kindLabel(kind)}</div>}
                          <span className="mono" style={{ fontWeight: 650 }}>{s.code}</span>
                        </td>
                        <td>
                          <div className="times">
                            {s.meetings.length ? (
                              s.meetings.map((m, idx) => (
                                <span key={idx}>
                                  {meetingText(m)}
                                  {m.room && <span className="muted"> · {m.room}</span>}
                                </span>
                              ))
                            ) : (
                              <span className="muted">TBA</span>
                            )}
                            {s.conflicts_with.length > 0 && (
                              <span style={{ color: 'var(--danger)', fontSize: 12, fontWeight: 600 }}>
                                <AlertTriangle size={12} style={{ verticalAlign: '-1px' }} /> Clashes with {s.conflicts_with.join(', ')}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="hide-sm muted">{s.instructor ?? '—'}</td>
                        <td>
                          <SeatMeter left={s.seats_left} capacity={s.capacity} />
                          {s.waitlist > 0 && <div className="faint" style={{ fontSize: 11.5, marginTop: 3 }}>{s.waitlist} waitlisted</div>}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <SectionAction
                            section={s}
                            blocked={blocked}
                            busy={busy === s.id}
                            onAdd={() => onAdd(s)}
                            onRemove={() => onRemove(s)}
                            onWaitlist={() => onWaitlist(s)}
                            onAlert={() => onAlert(s)}
                          />
                        </td>
                      </tr>
                    )),
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function SectionAction({
  section: s,
  blocked,
  busy,
  onAdd,
  onRemove,
  onWaitlist,
  onAlert,
}: {
  section: CatalogSection
  blocked: boolean
  busy: boolean
  onAdd: () => void
  onRemove: () => void
  onWaitlist: () => void
  onAlert: () => void
}) {
  if (s.enrolled_here) return <Badge tone="dark" icon={<Check />}>Registered</Badge>
  if (s.in_cart)
    return (
      <Button size="sm" variant="ghost" onClick={onRemove} loading={busy}>
        Remove
      </Button>
    )
  if (s.seats_left > 0)
    return (
      <Button size="sm" variant="primary" icon={blocked ? <Lock /> : <Plus />} disabled={blocked} loading={busy} onClick={onAdd} title={blocked ? 'Prerequisites missing' : undefined}>
        Add Course
      </Button>
    )
  return (
    <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
      {s.waitlisted ? (
        <Badge tone="info" icon={<Hourglass />}>#{s.waitlist_position} on waitlist</Badge>
      ) : (
        <Button size="sm" icon={<Hourglass />} disabled={blocked} loading={busy} onClick={onWaitlist}>
          Waitlist
        </Button>
      )}
      <Button size="sm" variant={s.alert ? 'accent' : 'ghost'} icon={s.alert ? <BellRing /> : <Bell />} onClick={onAlert} title="Seat alert" aria-label="Seat alert" />
    </div>
  )
}

function AlertModal({
  course,
  section,
  onClose,
  onDone,
}: {
  course: CatalogCourse
  section: CatalogSection
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [channels, setChannels] = useState<string[]>(['push', 'email'])
  const [busy, setBusy] = useState(false)
  const toggle = (c: string) => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c])

  const save = async () => {
    setBusy(true)
    try {
      if (channels.includes('push') && 'Notification' in window && Notification.permission === 'default') {
        await Notification.requestPermission()
      }
      await post('/api/alerts', { section_id: section.id, channels })
      toast('success', 'Seat alert on', `We'll notify you the moment a seat opens in ${course.code} ${section.code}.`)
      onDone()
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Seat alert"
      subtitle={`${course.code} ${course.title} · ${kindLabel(section.kind)} ${section.code} is full. Get notified in real time when the open seat count goes from 0 to 1.`}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={<BellRing />} loading={busy} disabled={!channels.length} onClick={save}>
            {section.alert ? 'Update alert' : 'Turn on alert'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {[
          ['push', 'Push notification', 'In the app and as a browser notification'],
          ['email', 'E-mail', 'Sent to the address on your profile'],
          ['sms', 'SMS', 'Delivered through the university gateway when configured'],
        ].map(([key, label, help]) => (
          <label key={key} className="checkbox" style={{ alignItems: 'flex-start' }}>
            <input type="checkbox" checked={channels.includes(key)} onChange={() => toggle(key)} />
            <span>
              <b style={{ display: 'block' }}>{label}</b>
              <span className="muted" style={{ fontSize: 12.5 }}>{help}</span>
            </span>
          </label>
        ))}
        <p className="faint" style={{ fontSize: 12 }}>You can watch up to 5 sections at a time.</p>
      </div>
    </Modal>
  )
}
