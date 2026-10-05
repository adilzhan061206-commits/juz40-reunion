import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  ClipboardPaste,
  Clock,
  Info,
  Lock,
  Sparkles,
  Wand2,
} from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, LoadingCards, Notice, PageHead } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { get } from '../../lib/api'
import { courseColor, ects } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { PrereqCheck, Term } from '../../lib/types'

interface DoneCourse {
  course_id: number
  code: string
  title: string
  ects: number
  grade?: string | null
  semester: number | null
}

interface NextCourse extends DoneCourse {
  offered: boolean
  sections: number
  open_seats: number
  prerequisite: PrereqCheck
  group?: string
  in_cart: boolean
  registered: boolean
  suggested?: boolean
}

interface MyCoursesData {
  term: Term
  season: 'fall' | 'spring' | null
  allowed_semesters: number[]
  current_semester: number
  program: { name: string; personal: boolean } | null
  warnings: string[]
  totals: { required: number; completed: number; percent: number }
  completed: DoneCourse[]
  in_progress: DoneCourse[]
  next: NextCourse[]
  electives: { group: string; ects_required: number; semester: number | null; codes: string[]; options: NextCourse[] }[]
  later: DoneCourse[]
}

export default function MyCourses() {
  const { termId } = useApp()
  const toast = useToast()
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(() => get<MyCoursesData>(`/api/my-courses?term_id=${termId ?? ''}`), [termId])
  const [picked, setPicked] = useState<Record<number, boolean>>({})
  const [showDone, setShowDone] = useState(false)

  const selectable = useMemo(
    () => [...(data?.next ?? []), ...(data?.electives.flatMap((e) => e.options) ?? [])],
    [data],
  )
  const isPicked = (c: NextCourse) => picked[c.course_id] ?? (!!c.suggested && !c.registered)
  // A missing corequisite is fine when that course is picked for the same term.
  const pickedCodes = new Set(selectable.filter((c) => isPicked(c)).map((c) => c.code))
  const isBlocked = (c: NextCourse) =>
    c.prerequisite.status !== 'waived' &&
    (c.prerequisite.missing.length > 0 || c.prerequisite.missing_corequisites.some((code) => !pickedCodes.has(code)))
  const chosen = selectable.filter((c) => c.offered && !isBlocked(c) && !c.registered && isPicked(c))
  const chosenEcts = chosen.reduce((n, c) => n + c.ects, 0)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !data) return <LoadingCards count={3} height={160} />
  if (!data) return null

  const seasonLabel = data.season === 'fall' ? 'Fall' : data.season === 'spring' ? 'Spring' : 'Summer'
  const toggle = (c: NextCourse) => setPicked({ ...picked, [c.course_id]: !isPicked(c) })

  const build = () => {
    if (!chosen.length) return toast('info', 'Choose at least one course')
    const list = chosen.map((c) => ({ id: c.course_id, code: c.code, title: c.title, ects: c.ects }))
    try {
      localStorage.setItem(`keste-gen-courses-${data.term.id}`, JSON.stringify(list))
    } catch {
      /* ignore */
    }
    navigate('/generator')
  }

  const noCurriculum = !data.program

  return (
    <>
      <PageHead
        eyebrow={`${data.term.name} · ${seasonLabel} term`}
        title="My courses"
        lead={
          data.season
            ? `${seasonLabel} terms only run semesters ${data.allowed_semesters.join(', ')} of your curriculum. Tick the courses you want to take in ${data.term.name} and build a conflict-free schedule from them.`
            : 'Tick the courses you want to take and build a conflict-free schedule from them.'
        }
      />

      {data.warnings.map((w) => (
        <div key={w} style={{ marginBottom: 12 }}>
          <Notice tone="warning">{w}</Notice>
        </div>
      ))}

      {noCurriculum ? (
        <Card>
          <Empty
            icon={<ClipboardPaste />}
            title="Your curriculum isn't loaded yet"
            action={
              <div className="row wrap" style={{ justifyContent: 'center' }}>
                <Link to="/profile"><Button variant="primary">Sync with my.sdu</Button></Link>
                <Link to="/profile"><Button>Paste “My Curriculum”</Button></Link>
              </div>
            }
          >
            Sign in with your SDU account (or re-sync in Profile) so we can read “My Curriculum”. If that doesn't work, open My Curriculum on
            my.sdu.edu.kz, press Ctrl+U, copy everything and paste it in Profile → Manual import.
          </Empty>
        </Card>
      ) : (
        <div className="split">
          <div className="stack lg">
            <Card>
              <CardHead
                title={`Take in ${data.term.name}`}
                icon={<Sparkles />}
                action={<Badge tone="outline">Semesters {data.allowed_semesters.join(' · ')}</Badge>}
              />
              <div className="card-body">
                {data.next.length === 0 ? (
                  <p className="muted" style={{ fontSize: 13.5 }}>
                    Nothing left from your curriculum for a {seasonLabel.toLowerCase()} term. 🎉
                  </p>
                ) : (
                  <div className="stack sm">
                    {data.next.map((c) => (
                      <CourseRow key={c.course_id} course={c} blocked={isBlocked(c)} checked={isPicked(c)} onToggle={() => toggle(c)} />
                    ))}
                  </div>
                )}
              </div>
            </Card>

            {data.electives.map((e) => (
              <Card key={e.group}>
                <CardHead title={e.group} icon={<CircleDashed />} action={<Badge tone="accent">Choose {e.ects_required} ECTS</Badge>} />
                <div className="card-body">
                  {e.options.length ? (
                    <div className="stack sm">
                      {e.options.map((c) => (
                        <CourseRow key={c.course_id} course={c} blocked={isBlocked(c)} checked={isPicked(c)} onToggle={() => toggle(c)} />
                      ))}
                    </div>
                  ) : (
                    <p className="muted" style={{ fontSize: 13 }}>
                      None of the options ({e.codes.slice(0, 8).join(', ')}{e.codes.length > 8 ? '…' : ''}) has sections in the catalogue
                      for {data.term.name} yet.
                    </p>
                  )}
                </div>
              </Card>
            ))}

            {data.in_progress.length > 0 && (
              <Card>
                <CardHead title="Taking now" icon={<Clock />} action={<Badge tone="warning">{data.in_progress.length}</Badge>} />
                <div className="card-body course-grid">
                  {data.in_progress.map((c) => (
                    <div key={c.course_id} className="course-tile in_progress">
                      <span className="status-dot in_progress" />
                      <div>
                        <b>{c.code}</b>
                        <span className="ttl">{c.title}</span>
                        <span className="sub">{c.ects} ECTS{c.semester ? ` · Sem ${c.semester}` : ''}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            <Card>
              <button className="card-head" style={{ width: '100%', paddingBottom: 18 }} onClick={() => setShowDone(!showDone)}>
                <h3>
                  <CheckCircle2 style={{ color: 'var(--success)' }} /> Completed · {data.completed.length} courses
                </h3>
                <ChevronDown size={18} style={{ transform: showDone ? 'rotate(180deg)' : undefined, transition: 'transform .2s' }} />
              </button>
              {showDone && (
                <div className="card-body course-grid" style={{ paddingTop: 0 }}>
                  {data.completed.map((c) => (
                    <div key={`${c.course_id}-${c.grade}`} className="course-tile completed">
                      <span className="status-dot completed" />
                      <div>
                        <b>{c.code}</b>
                        <span className="ttl">{c.title}</span>
                        <span className="sub">
                          {c.ects} ECTS{c.semester ? ` · Sem ${c.semester}` : ''}{c.grade ? ` · ${c.grade}` : ''}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {data.later.length > 0 && (
              <Card>
                <CardHead title={`Later — ${data.season === 'spring' ? 'fall' : 'spring'} terms only`} icon={<Info />} />
                <div className="card-body">
                  <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                    These belong to {data.season === 'spring' ? 'odd' : 'even'} semesters, so they can't be taken in {data.term.name}.
                  </p>
                  <div className="row wrap" style={{ gap: 6 }}>
                    {data.later.map((c) => (
                      <span key={c.course_id} className="code-tag" title={c.title}>
                        {c.code} · S{c.semester}
                      </span>
                    ))}
                  </div>
                </div>
              </Card>
            )}
          </div>

          <div className="sticky stack">
            <Card>
              <CardHead title="Your selection" icon={<Wand2 />} />
              <div className="card-body stack">
                <div className="row between">
                  <span className="muted">{chosen.length} courses</span>
                  <b style={{ fontFamily: 'var(--font-display)', fontSize: 26 }}>{ects(chosenEcts)}</b>
                </div>
                {chosenEcts > 40 && <Notice tone="warning">Above the usual 40 ECTS limit — you'll need an overload approval.</Notice>}
                <div className="stack sm">
                  {chosen.map((c) => (
                    <div key={c.course_id} className="row" style={{ gap: 8, fontSize: 13 }}>
                      <span className="color-dot" style={{ background: courseColor(c.code) }} />
                      <b className="mono" style={{ fontSize: 12 }}>{c.code}</b>
                      <span className="muted grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                    </div>
                  ))}
                </div>
                <Button variant="accent" size="lg" block icon={<Wand2 />} disabled={!chosen.length} onClick={build}>
                  Build schedule
                </Button>
                <p className="faint" style={{ fontSize: 12 }}>
                  Next you'll see every conflict-free timetable for these courses and can send the one you like to registration.
                </p>
              </div>
            </Card>
            <Card pad>
              <div className="row between">
                <span className="muted" style={{ fontSize: 13 }}>Degree progress</span>
                <b>{Math.round(data.totals.percent)}%</b>
              </div>
              <div className="progress" style={{ marginTop: 8 }}>
                <i className="done" style={{ width: `${data.totals.percent}%` }} />
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
                {data.program?.name} · around semester {data.current_semester}
              </div>
              <Link to="/degree" className="link" style={{ fontSize: 13, marginTop: 8, display: 'inline-block' }}>
                Full degree audit <ArrowRight size={13} style={{ verticalAlign: '-2px' }} />
              </Link>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}

function CourseRow({ course: c, blocked, checked, onToggle }: { course: NextCourse; blocked: boolean; checked: boolean; onToggle: () => void }) {
  const disabled = !c.offered || blocked || c.registered
  return (
    <label
      className="selected-course"
      style={{
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled && !c.registered ? 0.62 : 1,
        borderColor: checked && !disabled ? 'var(--accent-strong)' : undefined,
        background: checked && !disabled ? 'color-mix(in srgb, var(--accent-soft) 45%, var(--surface))' : undefined,
      }}
    >
      <input type="checkbox" checked={!disabled && checked} disabled={disabled} onChange={onToggle} style={{ width: 17, height: 17, accentColor: 'var(--accent-strong)' }} />
      <span className="color-dot" style={{ background: courseColor(c.code) }} />
      <div className="grow">
        <div className="row wrap" style={{ gap: 8 }}>
          <b className="mono" style={{ fontSize: 12.5 }}>{c.code}</b>
          <span style={{ fontSize: 13.5, fontWeight: 560 }}>{c.title}</span>
        </div>
        <div className="row wrap" style={{ gap: 6, marginTop: 5 }}>
          {c.semester && <Badge tone="outline">Semester {c.semester}</Badge>}
          <Badge tone="outline">{ects(c.ects)}</Badge>
          {c.registered ? (
            <Badge tone="dark" icon={<CheckCircle2 />}>Registered</Badge>
          ) : !c.offered ? (
            <Badge tone="warning">No sections this term</Badge>
          ) : blocked ? (
            <Badge tone="danger" icon={<Lock />}>{c.prerequisite.message}</Badge>
          ) : c.prerequisite.blocked ? (
            <Badge tone="info">Taken together with {c.prerequisite.missing_corequisites.join(', ')}</Badge>
          ) : c.open_seats > 0 ? (
            <Badge tone="success">{c.sections} sections · open</Badge>
          ) : (
            <Badge tone="danger">Full — waitlist</Badge>
          )}
          {c.prerequisite.status === 'provisional' && <Badge tone="warning">Needs {c.prerequisite.provisional.join(', ')} (in progress)</Badge>}
          {c.suggested && !c.registered && <Badge tone="accent" icon={<Sparkles />}>Recommended</Badge>}
        </div>
      </div>
      {blocked && (
        <Link to={`/registration?course=${encodeURIComponent(c.code)}`} className="link" style={{ fontSize: 12.5, whiteSpace: 'nowrap' }}>
          Details
        </Link>
      )}
    </label>
  )
}
