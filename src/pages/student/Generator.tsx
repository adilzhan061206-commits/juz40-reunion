import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, CheckCircle2, Search, Sparkles, Wand2, X } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, Notice, PageHead } from '../../components/ui'
import WeekGrid from '../../components/WeekGrid'
import { toGridItems } from '../../lib/grid'
import { useApp, useToast } from '../../context/app'
import { errorText, get, post } from '../../lib/api'
import { courseColor, DAYS, ects, kindLabel, meetingText } from '../../lib/format'
import { useDebounced, useLocalStorage } from '../../lib/hooks'
import type { Recommendation, SectionT } from '../../lib/types'

interface PickedCourse {
  id: number
  code: string
  title: string
  ects: number
}

interface GeneratorResult {
  schedules: { id: string; section_ids: number[]; days_used: number; gap_minutes: number }[]
  total_found: number
  truncated: boolean
  elapsed_ms: number
  message: string | null
  diagnostics: { course: string; reason: string; message: string }[]
  conflicts: { courses: string[]; section_ids: number[]; message: string }[]
  sections: Record<string, SectionT>
}

const WINDOWS = [
  { value: 'any', label: 'Any time' },
  { value: 'morning', label: 'Morning 08–12' },
  { value: 'afternoon', label: 'Afternoon 12–17' },
  { value: 'evening', label: 'Evening 17+' },
]

export default function Generator() {
  const { termId, term } = useApp()
  const toast = useToast()
  const [picked, setPicked] = useLocalStorage<PickedCourse[]>(`keste-gen-courses-${termId}`, [])
  const [daysOff, setDaysOff] = useLocalStorage<number[]>('keste-gen-daysoff', [])
  const [windowKey, setWindow] = useLocalStorage<string>('keste-gen-window', 'any')
  const [onlyOpen, setOnlyOpen] = useState(true)
  const [query, setQuery] = useState('')
  const [options, setOptions] = useState<PickedCourse[]>([])
  const [latest, setResult] = useState<GeneratorResult | null>(null)
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(false)
  const [applying, setApplying] = useState(false)
  const q = useDebounced(query, 180)

  useEffect(() => {
    let alive = true
    get<{ courses: PickedCourse[] }>(`/api/courses?term_id=${termId ?? ''}&q=${encodeURIComponent(q)}`)
      .then((d) => alive && setOptions(d.courses))
      .catch(() => {})
    return () => {
      alive = false
    }
  }, [q, termId])

  const request = useMemo(
    () => JSON.stringify({ term_id: termId, course_ids: picked.map((c) => c.id), days_off: daysOff, window: windowKey, only_open: onlyOpen }),
    [termId, picked, daysOff, windowKey, onlyOpen],
  )
  const debouncedRequest = useDebounced(request, 260)

  useEffect(() => {
    const body = JSON.parse(debouncedRequest)
    if (!body.course_ids.length) return
    let alive = true
    // The spinner reflects an in-flight request started by this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    post<GeneratorResult>('/api/generator', body)
      .then((r) => {
        if (!alive) return
        setResult(r)
        setIndex(0)
      })
      .catch((e) => alive && toast('error', 'Could not generate schedules', errorText(e)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [debouncedRequest, toast])

  const toggleCourse = (c: PickedCourse) => {
    if (picked.some((p) => p.id === c.id)) setPicked(picked.filter((p) => p.id !== c.id))
    else if (picked.length >= 10) toast('info', 'Up to 10 courses at a time')
    else setPicked([...picked, c])
  }

  const useRecommendations = async () => {
    try {
      const data = await get<{ recommendations: Recommendation[] }>(`/api/recommendations?term_id=${termId ?? ''}`)
      const top = data.recommendations.slice(0, 5).map((r) => ({ id: r.course_id, code: r.code, title: r.title, ects: r.ects }))
      if (!top.length) return toast('info', 'No recommendations available yet')
      setPicked(top)
      toast('success', `Added ${top.length} recommended courses`)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const result = picked.length ? latest : null
  const current = result?.schedules[index]
  const sections = current ? current.section_ids.map((id) => result!.sections[id]).filter(Boolean) : []
  const conflictSections = result && !current ? result.conflicts.flatMap((c) => c.section_ids.map((id) => result.sections[id])).filter(Boolean) : []
  const totalEcts = picked.reduce((n, c) => n + c.ects, 0)

  const apply = async () => {
    if (!current) return
    setApplying(true)
    try {
      await post('/api/cart/apply', { section_ids: current.section_ids })
      toast('success', 'Added to your draft', 'Review it in My Schedule and press Register.')
    } catch (e) {
      toast('error', errorText(e))
    } finally {
      setApplying(false)
    }
  }

  return (
    <>
      <PageHead
        eyebrow={term?.name}
        title="Build schedule"
        lead={<>Step 2 of 3. Set your preferred days and hours — every section combination is checked in real time and only timetables with zero overlaps are shown. Change the course list in <Link to="/my-courses" className="link">My courses</Link>.</>}
        actions={
          <Button icon={<Sparkles />} onClick={useRecommendations}>
            Use my recommendations
          </Button>
        }
      />

      <div className="split left">
        <div className="stack lg">
          <Card>
            <CardHead title="Courses" action={<Badge tone="outline">{picked.length} · {ects(totalEcts)}</Badge>} />
            <div className="card-body stack">
              {picked.length > 0 && (
                <div className="stack sm">
                  {picked.map((c) => (
                    <div key={c.id} className="selected-course">
                      <span className="color-dot" style={{ background: courseColor(c.code) }} />
                      <div className="grow">
                        <b className="mono" style={{ fontSize: 12.5 }}>{c.code}</b>
                        <div style={{ fontSize: 12.5 }} className="muted">{c.title}</div>
                      </div>
                      <button className="btn ghost sm icon" onClick={() => toggleCourse(c)} aria-label={`Remove ${c.code}`}>
                        <X />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div>
                <div className="input-icon">
                  <Search />
                  <input className="input" placeholder="Add a course…" value={query} onChange={(e) => setQuery(e.target.value)} />
                </div>
                <div className="picker-list">
                  {options.map((c) => {
                    const on = picked.some((p) => p.id === c.id)
                    return (
                      <button key={c.id} className={on ? 'on' : ''} onClick={() => toggleCourse(c)}>
                        <span className="color-dot" style={{ background: courseColor(c.code) }} />
                        <b className="mono" style={{ fontSize: 12 }}>{c.code}</b>
                        <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                        {on && <CheckCircle2 size={15} color="var(--accent-strong)" />}
                      </button>
                    )
                  })}
                  {options.length === 0 && <p className="muted" style={{ padding: 12, fontSize: 13 }}>No offered courses match.</p>}
                </div>
              </div>
            </div>
          </Card>

          <Card>
            <CardHead title="Preferences" />
            <div className="card-body stack lg">
              <div className="stack sm">
                <span className="field-label">Days off</span>
                <div className="day-toggle">
                  {DAYS.slice(0, 6).map((d, i) => (
                    <button
                      key={d}
                      className={daysOff.includes(i) ? 'off' : ''}
                      onClick={() => setDaysOff(daysOff.includes(i) ? daysOff.filter((x) => x !== i) : [...daysOff, i])}
                      aria-pressed={daysOff.includes(i)}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <span className="help muted" style={{ fontSize: 12 }}>Tap a day to keep it free — e.g. "No Friday classes".</span>
              </div>
              <div className="stack sm">
                <span className="field-label">Time window</span>
                <div className="stack sm">
                  {WINDOWS.map((w) => (
                    <label key={w.value} className="checkbox">
                      <input type="radio" name="window" checked={windowKey === w.value} onChange={() => setWindow(w.value)} /> {w.label}
                    </label>
                  ))}
                </div>
              </div>
              <label className="checkbox">
                <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} /> Only sections with open seats
              </label>
            </div>
          </Card>
        </div>

        <div className="stack lg">
          {!picked.length ? (
            <Card>
              <Empty icon={<Wand2 />} title="Add courses to start" action={<Button variant="accent" icon={<Sparkles />} onClick={useRecommendations}>Use my recommendations</Button>}>
                Choose the courses you need this term. The generator explores every section combination and keeps only those without
                overlaps.
              </Empty>
            </Card>
          ) : (
            <>
              <Card pad>
                <div className="row between wrap" style={{ gap: 16 }}>
                  <div>
                    <div className="eyebrow">Result</div>
                    <div className="row" style={{ gap: 12, marginTop: 6 }}>
                      <span className="gen-count">
                        {result?.schedules.length ? `${index + 1} / ${result.schedules.length}` : loading ? '…' : '0'}
                      </span>
                      <span className="muted" style={{ fontSize: 13 }}>
                        {result ? `${result.total_found}${result.truncated ? '+' : ''} conflict-free option${result.total_found === 1 ? '' : 's'} · ${result.elapsed_ms} ms` : 'Generating…'}
                      </span>
                      {loading && <span className="spinner" style={{ width: 16, height: 16 }} />}
                    </div>
                  </div>
                  <div className="gen-nav">
                    <Button icon={<ArrowLeft />} disabled={!result || index === 0} onClick={() => setIndex(index - 1)}>
                      Previous
                    </Button>
                    <Button disabled={!result || index >= (result?.schedules.length ?? 1) - 1} onClick={() => setIndex(index + 1)}>
                      Next <ArrowRight />
                    </Button>
                    <Button variant="accent" icon={<CheckCircle2 />} disabled={!current} loading={applying} onClick={apply}>
                      Use this schedule
                    </Button>
                  </div>
                </div>
                {current && (
                  <div className="row wrap" style={{ marginTop: 14, gap: 8 }}>
                    <Badge tone="success">0 conflicts</Badge>
                    <Badge tone="outline">{current.days_used} days on campus</Badge>
                    <Badge tone="outline">{Math.round(current.gap_minutes / 60 * 10) / 10} h of gaps</Badge>
                    {index === 0 && <Badge tone="accent">Most compact</Badge>}
                  </div>
                )}
              </Card>

              {result && !current && (
                <Notice tone="danger" title={result.message ?? undefined}>
                  {result.diagnostics.map((d) => (
                    <div key={d.course} style={{ marginTop: 6 }}>{d.message}</div>
                  ))}
                  {result.conflicts.map((c) => (
                    <div key={c.courses.join()} style={{ marginTop: 6 }}>
                      <b>{c.courses.join(' × ')}</b> — {c.message} The overlapping sections are highlighted below.
                    </div>
                  ))}
                  {!result.diagnostics.length && !result.conflicts.length && (
                    <div style={{ marginTop: 6 }}>Try removing a course, allowing more days, or widening the time window.</div>
                  )}
                </Notice>
              )}

              <WeekGrid
                items={current ? toGridItems(sections) : toGridItems(conflictSections, { conflict: true })}
                daysOff={daysOff}
                emptyText={loading ? 'Generating…' : 'No schedule to preview'}
              />

              {current && (
                <Card>
                  <CardHead title="Sections in this option" />
                  <div className="list" style={{ marginTop: 6 }}>
                    {sections.map((s) => (
                      <div key={s.id} className="item">
                        <span className="color-dot" style={{ background: courseColor(s.course.code) }} />
                        <div className="grow">
                          <b style={{ fontSize: 13.5 }}>
                            {s.course.code} · {kindLabel(s.kind)} {s.code}
                          </b>
                          <div className="muted" style={{ fontSize: 12.5 }}>
                            {s.meetings.map(meetingText).join(', ')} {s.instructor && `· ${s.instructor}`}
                          </div>
                        </div>
                        <span className="muted hide-sm" style={{ fontSize: 12.5 }}>{s.seats_left} seats left</span>
                      </div>
                    ))}
                  </div>
                  <div className="card-body">
                    <Link to="/schedule" className="link" style={{ fontSize: 13 }}>
                      Go to My Schedule →
                    </Link>
                  </div>
                </Card>
              )}
            </>
          )}
        </div>
      </div>
    </>
  )
}
