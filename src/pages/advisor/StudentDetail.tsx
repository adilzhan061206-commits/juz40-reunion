import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, BarChart3, BookOpen, CalendarDays, FileCheck2 } from 'lucide-react'
import { Badge, Button, Card, CardHead, ErrorState, LoadingCards, Notice, PageHead, Ring } from '../../components/ui'
import { CourseTiles, GapChart } from '../../components/GapChart'
import WeekGrid from '../../components/WeekGrid'
import { toGridItems } from '../../lib/grid'
import { get } from '../../lib/api'
import { courseColor, initials, kindLabel, meetingText, timeAgo } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { Audit, OverrideRequestT, SectionT, User } from '../../lib/types'

interface Detail {
  student: User
  audit: Audit
  offered_sections: SectionT[]
  requests: OverrideRequestT[]
  schedule: SectionT[]
}

function hasLecture(list: SectionT[], courseId: number) {
  return list.some((x) => x.course.id === courseId && x.kind === 'lecture')
}

export default function StudentDetail() {
  const { id } = useParams()
  const { data, error, loading, reload } = useAsync(() => get<Detail>(`/api/advisor/students/${id}`), [id])
  const [selected, setSelected] = useState<number | null>(null)

  const group = data?.audit.groups.find((g) => g.id === selected) ?? null
  const filteredSections = useMemo(() => {
    if (!data) return []
    const ids = new Set((group ? group.missing_courses : data.audit.groups.flatMap((g) => g.missing_courses)).map((c) => c.course_id))
    return data.offered_sections.filter((s) => ids.has(s.course.id))
  }, [data, group])

  const offeredCourses = Object.values(
    filteredSections.reduce<Record<number, { course: SectionT['course']; sections: SectionT[]; open: number }>>((acc, sec) => {
      const entry = (acc[sec.course.id] ??= { course: sec.course, sections: [], open: 0 })
      entry.sections.push(sec)
      if (sec.kind === 'lecture' || !hasLecture(filteredSections, sec.course.id)) entry.open += sec.seats_left
      return acc
    }, {}),
  )

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !data) return <LoadingCards count={3} height={200} />
  if (!data) return null
  const { student, audit } = data
  const t = audit.totals

  return (
    <>
      <Link to="/advisor/students" className="link row" style={{ gap: 6, fontSize: 13, marginBottom: 14, display: 'inline-flex' }}>
        <ArrowLeft size={15} /> All students
      </Link>
      <PageHead
        title={
          <span className="row" style={{ gap: 14 }}>
            <span className="avatar lg">{initials(student.name)}</span>
            {student.name}
          </span>
        }
        lead={`${audit.program?.name ?? 'No programme'}${student.sdu_id ? ` · SDU ${student.sdu_id}` : ''}${student.last_sdu_sync ? ` · synced ${timeAgo(student.last_sdu_sync)}` : ''}`}
        actions={student.financial_hold ? <Badge tone="danger">Financial hold</Badge> : undefined}
      />

      <div className="stack lg">
        {audit.warnings.map((w) => <Notice key={w} tone="warning">{w}</Notice>)}

        <div className="grid degree-top">
          <Card pad="lg">
            <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
              <Ring value={t.percent} secondary={t.required ? (t.in_progress / t.required) * 100 : 0} size={160} stroke={15} sub={`${t.completed} / ${t.required} ECTS`} />
              <div className="row wrap" style={{ justifyContent: 'center', gap: 6 }}>
                <Badge tone="success">{t.completed} completed</Badge>
                <Badge tone="warning">{t.in_progress} in progress</Badge>
                <Badge tone="danger">{t.missing} missing</Badge>
              </div>
            </div>
          </Card>
          <Card>
            <CardHead title="Degree gap visualizer" icon={<BarChart3 />} action={<span className="muted" style={{ fontSize: 12.5 }}>Click a bar to filter courses</span>} />
            <div className="card-body">
              <GapChart groups={audit.groups} selected={selected} onSelect={setSelected} />
            </div>
          </Card>
        </div>

        <div className="split">
          <div className="stack lg">
            <Card>
              <CardHead
                title={group ? `Missing ${group.name} requirements` : 'All missing requirements'}
                icon={<BookOpen />}
                action={group && <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Show all</Button>}
              />
              <div className="card-body">
                <CourseTiles
                  items={(group ? group.items : audit.groups.flatMap((g) => g.items)).filter((i) => i.status !== 'completed' || !!group)}
                  upcoming={audit.upcoming_term?.name}
                />
              </div>
            </Card>
            <Card>
              <CardHead title={`Available in ${audit.upcoming_term?.name ?? 'the upcoming term'}`} icon={<CalendarDays />} action={<Badge tone="outline">{offeredCourses.length} courses</Badge>} />
              {offeredCourses.length === 0 ? (
                <p className="muted card-body" style={{ fontSize: 13 }}>No sections of these courses are offered next term.</p>
              ) : (
                <div className="scroll-x" style={{ marginTop: 8 }}>
                  <table className="table">
                    <thead>
                      <tr><th>Course</th><th>Sections</th><th>Example times</th><th>Open seats</th></tr>
                    </thead>
                    <tbody>
                      {offeredCourses.map(({ course, sections, open }) => (
                        <tr key={course.id} className={open > 0 ? 'hl' : ''}>
                          <td>
                            <span className="row" style={{ gap: 8 }}>
                              <span className="color-dot" style={{ background: courseColor(course.code) }} />
                              <b className="mono" style={{ fontSize: 12.5 }}>{course.code}</b> {course.title}
                            </span>
                          </td>
                          <td className="muted" style={{ fontSize: 12.5 }}>
                            {['lecture', 'practice', 'lab']
                              .map((k) => [k, sections.filter((x) => x.kind === k).length] as const)
                              .filter(([, n]) => n)
                              .map(([k, n]) => `${n} ${kindLabel(k).toLowerCase()}`)
                              .join(' · ')}
                          </td>
                          <td className="muted" style={{ fontSize: 12.5 }}>{sections[0]?.meetings.map(meetingText).join(', ')}</td>
                          <td>{open > 0 ? <Badge tone="success">{open} open</Badge> : <Badge tone="danger">Full</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          </div>
          <div className="stack lg">
            <Card>
              <CardHead title="Requests" icon={<FileCheck2 />} />
              <div className="list" style={{ marginTop: 8 }}>
                {data.requests.length === 0 && <p className="muted" style={{ padding: '0 20px 18px', fontSize: 13 }}>No requests.</p>}
                {data.requests.map((r) => (
                  <div key={r.id} className="item">
                    <div className="grow">
                      <b style={{ fontSize: 13 }}>{r.kind === 'credit_overload' ? `Overload → ${r.requested_ects} ECTS` : `Waiver · ${r.course?.code}`}</b>
                      <div className="muted" style={{ fontSize: 12 }}>{r.term.name} · {timeAgo(r.created_at)}</div>
                    </div>
                    <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge>
                  </div>
                ))}
              </div>
            </Card>
            <div>
              <div className="eyebrow" style={{ margin: '0 0 10px 4px' }}>Upcoming-term schedule</div>
              <WeekGrid items={toGridItems(data.schedule)} compact emptyText="Not registered yet" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
