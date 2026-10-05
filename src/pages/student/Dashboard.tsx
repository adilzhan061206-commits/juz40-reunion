import { Link } from 'react-router-dom'
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  CalendarDays,
  Clock,
  GraduationCap,
  Hourglass,
  ListChecks,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, LoadingCards, Notice, Ring, StackedBar, Stat } from '../../components/ui'
import WeekGrid from '../../components/WeekGrid'
import { toGridItems } from '../../lib/grid'
import { useApp } from '../../context/app'
import { get } from '../../lib/api'
import { courseColor, DAYS_LONG, ects, greeting, hhmm, kindLabel, timeAgo } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { Recommendation, SectionT, Term } from '../../lib/types'

interface DashboardData {
  current_term: Term | null
  today: number
  current_schedule: SectionT[]
  current_ects: number
  upcoming: { term: Term; enrolled_ects: number; courses: number; cart: number; confirmed: boolean } | null
  audit: {
    totals: { required: number; completed: number; in_progress: number; missing: number; percent: number }
    program: { name: string } | null
    warnings: string[]
    groups: { name: string; category: string; required_ects: number; completed_ects: number; in_progress_ects: number; missing_ects: number }[]
  }
  unread: number
  pending_requests: number
  waitlists: number
}

export default function Dashboard() {
  const { user } = useApp()
  const { data, error, loading, reload } = useAsync(() => get<DashboardData>('/api/dashboard'), [])
  const recs = useAsync(
    () => get<{ recommendations: Recommendation[] }>('/api/recommendations').catch(() => ({ recommendations: [] })),
    [],
  )

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !data) return <LoadingCards count={3} height={160} />
  if (!data) return null

  const first = user?.name.split(' ')[0] ?? ''
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const today = data.current_schedule
    .flatMap((s) => s.meetings.filter((m) => m.day === data.today).map((m) => ({ s, m })))
    .sort((a, b) => a.m.start - b.m.start)
  const totals = data.audit.totals
  const wipPct = totals.required ? (totals.in_progress / totals.required) * 100 : 0
  const up = data.upcoming

  return (
    <div className="stack lg">
      <section className="hero">
        <div className="hero-grid">
          <div>
            <div className="eyebrow" style={{ color: 'var(--accent)' }}>
              {DAYS_LONG[data.today]} · {data.current_term?.name ?? 'No active term'}
            </div>
            <h1 style={{ marginTop: 10 }}>
              {greeting()}, {first}
            </h1>
            <p className="lead">
              {up && up.term.registration_open
                ? up.courses
                  ? `You're registered for ${up.courses} course${up.courses > 1 ? 's' : ''} (${ects(up.enrolled_ects)}) in ${up.term.name}${up.confirmed ? ' — schedule confirmed.' : '. Confirm your schedule when you are done.'}`
                  : `${up.term.name} registration is open. Let the assistant build a conflict-free schedule from your degree gaps.`
                : 'Here is your week at a glance.'}
            </p>
            <div className="row wrap" style={{ marginTop: 20 }}>
              <Link to="/my-courses">
                <Button variant="accent" icon={<ListChecks />}>
                  Choose my courses
                </Button>
              </Link>
              <Link to="/registration">
                <Button icon={<BookOpen />}>Course catalogue</Button>
              </Link>
            </div>
          </div>
          <div className="hide-sm" style={{ textAlign: 'right' }}>
            {user?.sdu_id ? (
              <Badge tone="dark" icon={<RefreshCw />}>
                {user.last_sdu_sync ? `Synced with SDU ${timeAgo(user.last_sdu_sync)}` : 'Linked to SDU'}
              </Badge>
            ) : (
              <Link to="/profile">
                <Button size="sm" icon={<RefreshCw />}>
                  Link my SDU account
                </Button>
              </Link>
            )}
          </div>
        </div>
      </section>

      <div className="steps-strip">
        {[
          { to: '/my-courses', n: 1, icon: <ListChecks />, title: 'Choose courses', text: `Tick what you need from your curriculum${up ? ` for ${up.term.name}` : ''}.` },
          { to: '/generator', n: 2, icon: <Wand2 />, title: 'Build a schedule', text: 'Pick days off and hours — get only conflict-free timetables.' },
          { to: '/schedule', n: 3, icon: <CalendarCheck />, title: 'Register & confirm', text: 'Register the draft, confirm it and export to your calendar.' },
        ].map((s) => (
          <Link key={s.n} to={s.to} className="step card interactive">
            <span className="step-n">{s.n}</span>
            <div>
              <b className="row" style={{ gap: 7 }}>{s.icon}{s.title}</b>
              <span className="muted">{s.text}</span>
            </div>
            <ArrowRight size={16} className="faint" />
          </Link>
        ))}
      </div>

      {data.audit.warnings.map((w) => (
        <Notice key={w} tone="warning">
          {w}{' '}
          <Link to="/profile" className="link">
            Fix it
          </Link>
        </Notice>
      ))}

      <div className="grid cols-4">
        <Stat label="Degree progress" icon={<GraduationCap />} value={`${Math.round(totals.percent)}`} unit="%" hint={`${totals.completed} of ${totals.required} ECTS completed`} />
        <Stat label="This term" icon={<CalendarDays />} value={data.current_ects} unit="ECTS" hint={`${new Set(data.current_schedule.map((s) => s.course.id)).size} courses · ${data.current_term?.name ?? ''}`} />
        <Stat
          label={up ? `${up.term.name} registration` : 'Registration'}
          icon={<CalendarCheck />}
          value={up?.enrolled_ects ?? 0}
          unit="ECTS"
          hint={up ? (up.confirmed ? 'Schedule confirmed ✓' : up.cart ? `${up.cart} section(s) in your draft` : 'Nothing registered yet') : '—'}
        />
        <Stat
          label="Waitlists & requests"
          icon={<Hourglass />}
          value={data.waitlists + data.pending_requests}
          hint={`${data.waitlists} waitlisted · ${data.pending_requests} pending with advisor`}
        />
      </div>

      <div className="split">
        <div className="stack lg">
          <Card>
            <CardHead
              title={`Today · ${DAYS_LONG[data.today]}`}
              icon={<Clock />}
              action={
                <Link to="/schedule" className="link" style={{ fontSize: 13 }}>
                  Full schedule
                </Link>
              }
            />
            <div className="card-body">
              {today.length === 0 ? (
                <p className="muted">No classes today. Enjoy the free time — or plan next semester.</p>
              ) : (
                <div className="timeline">
                  {today.map(({ s, m }) => {
                    const state = m.end < nowMin ? 'past' : m.start <= nowMin ? 'now' : ''
                    return (
                      <div key={`${s.id}-${m.start}`} className={`tl-item ${state}`}>
                        <div className="when">
                          {hhmm(m.start)}
                          <small>{hhmm(m.end)}</small>
                        </div>
                        <div className="bar" style={{ background: courseColor(s.course.code) }} />
                        <div>
                          <div className="row" style={{ gap: 8 }}>
                            <span className="code-tag">{s.course.code}</span>
                            <b style={{ fontSize: 14 }}>{s.course.title}</b>
                            {state === 'now' && <Badge tone="accent">Now</Badge>}
                          </div>
                          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
                            {kindLabel(s.kind)} {s.code}
                            {m.room ? ` · Room ${m.room}` : ''}
                            {s.instructor ? ` · ${s.instructor}` : ''}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </Card>
          <WeekGrid items={toGridItems(data.current_schedule)} showNow emptyText="No classes this term yet" />
        </div>

        <div className="stack lg">
          <Card>
            <CardHead title="Degree progress" icon={<TrendingUp />} action={<Link to="/degree" className="link" style={{ fontSize: 13 }}>Details</Link>} />
            <div className="card-body">
              {data.audit.program ? (
                <>
                  <div className="row" style={{ gap: 18 }}>
                    <Ring value={totals.percent} secondary={wipPct} size={112} stroke={11} sub="complete" />
                    <div className="stack sm grow">
                      <b style={{ fontSize: 14 }}>{data.audit.program.name}</b>
                      <span className="muted" style={{ fontSize: 12.5 }}>
                        {totals.missing} ECTS still to plan · {totals.in_progress} in progress
                      </span>
                    </div>
                  </div>
                  <div className="stack" style={{ marginTop: 16 }}>
                    {data.audit.groups.map((g) => (
                      <div key={g.name} className="meter">
                        <div className="row between">
                          <span style={{ fontWeight: 600 }}>{g.name}</span>
                          <span className="muted">
                            {g.completed_ects}/{g.required_ects}
                          </span>
                        </div>
                        <StackedBar className="progress" done={g.completed_ects} wip={g.in_progress_ects} missing={0} total={g.required_ects} />
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <Empty icon={<GraduationCap />} title="No programme selected" action={<Link to="/profile"><Button size="sm">Choose programme</Button></Link>}>
                  Pick your degree programme to unlock the degree audit.
                </Empty>
              )}
            </div>
          </Card>

          <Card>
            <CardHead title="Recommended next" icon={<Sparkles />} action={<Link to="/recommendations" className="link" style={{ fontSize: 13 }}>All</Link>} />
            <div className="list" style={{ marginTop: 8 }}>
              {(recs.data?.recommendations ?? []).slice(0, 4).map((r) => (
                <Link key={r.course_id} to={`/registration?course=${encodeURIComponent(r.code)}`} className="item" style={{ padding: '12px 20px' }}>
                  <span className="color-dot" style={{ background: courseColor(r.code) }} />
                  <div className="grow">
                    <div style={{ fontWeight: 620, fontSize: 13.5 }}>
                      {r.code} · {r.title}
                    </div>
                    <div className="muted" style={{ fontSize: 12 }}>
                      {r.fulfills} · {ects(r.ects)}
                    </div>
                  </div>
                  <ArrowRight size={16} className="faint" />
                </Link>
              ))}
              {recs.data && recs.data.recommendations.length === 0 && (
                <p className="muted" style={{ padding: '4px 20px 18px', fontSize: 13 }}>
                  No recommendations yet — complete your profile and sync with SDU.
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  )
}
