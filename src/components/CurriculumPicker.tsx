import { useState } from 'react'
import { Link } from 'react-router-dom'
import { CheckCircle2, Lock, Plus, Search } from 'lucide-react'
import { Badge } from './ui'
import { get } from '../lib/api'
import { courseColor } from '../lib/format'
import { useAsync, useDebounced } from '../lib/hooks'
import type { CurriculumData, CurriculumItem, PickCourse } from '../lib/curriculum'

/** Remaining curriculum courses for a term, grouped by semester like my.sdu "My Curriculum".
 *  Completed and running courses never appear. */
export default function CurriculumPicker({
  data,
  termId,
  selected,
  onToggle,
  requireSections = true,
}: {
  data: CurriculumData | undefined
  termId: number | null | undefined
  selected: number[]
  onToggle: (course: PickCourse) => void
  requireSections?: boolean
}) {
  const [query, setQuery] = useState('')
  const q = useDebounced(query, 200)
  const search = useAsync(
    () =>
      q.trim()
        ? get<{ courses: (PickCourse & { completed: boolean; in_progress: boolean; in_curriculum: boolean })[] }>(
            `/api/courses?q=${encodeURIComponent(q)}${requireSections && termId ? `&term_id=${termId}` : ''}`,
          )
        : Promise.resolve({ courses: [] }),
    [q, termId, requireSections],
  )

  if (!data) return <div className="skeleton" style={{ height: 160 }} />

  const groups = new Map<number, { item: CurriculumItem; elective?: string }[]>()
  for (const item of data.next) {
    const key = item.semester ?? 0
    groups.set(key, [...(groups.get(key) ?? []), { item }])
  }
  for (const e of data.electives) {
    for (const item of e.options) {
      const key = item.semester ?? e.semester ?? 0
      groups.set(key, [...(groups.get(key) ?? []), { item, elective: e.group.replace(/^Semester \d+ · /, '') }])
    }
  }
  const semesters = [...groups.keys()].sort((a, b) => (a || 99) - (b || 99))

  const row = (item: CurriculumItem, elective?: string) => {
    const on = selected.includes(item.course_id)
    const unavailable = (requireSections && !item.offered) || item.prerequisite.missing.length > 0 || item.registered
    return (
      <button
        key={item.course_id}
        className={on ? 'on' : ''}
        disabled={unavailable && !on}
        style={{ opacity: unavailable && !on ? 0.55 : 1 }}
        onClick={() => onToggle({ id: item.course_id, code: item.code, title: item.title, ects: item.ects })}
        title={item.prerequisite.missing.length ? item.prerequisite.message : undefined}
      >
        <span className="color-dot" style={{ background: courseColor(item.code) }} />
        <b className="mono" style={{ fontSize: 12 }}>{item.code}</b>
        <span className="grow" style={{ minWidth: 0 }}>
          <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
          <span className="faint" style={{ fontSize: 11.5 }}>
            {item.ects} ECTS{elective ? ` · ${elective}` : ''}
            {item.registered ? ' · registered' : requireSections && !item.offered ? ' · no sections' : ''}
          </span>
        </span>
        {item.prerequisite.missing.length > 0 ? (
          <Lock size={14} color="var(--danger)" />
        ) : on ? (
          <CheckCircle2 size={16} color="var(--accent-strong)" />
        ) : (
          <Plus size={15} className="faint" />
        )}
      </button>
    )
  }

  return (
    <div className="stack">
      {!data.program ? (
        <p className="muted" style={{ fontSize: 13 }}>
          Your curriculum isn't loaded yet. <Link to="/profile" className="link">Sync with my.sdu</Link> to see your courses by semester.
        </p>
      ) : semesters.length === 0 ? (
        <p className="muted" style={{ fontSize: 13 }}>No remaining curriculum courses for this term.</p>
      ) : (
        <div className="picker-list" style={{ maxHeight: 420, marginTop: 0 }}>
          {semesters.map((s) => (
            <div key={s}>
              <div className="picker-head">
                <span>{s ? `Semester ${s}` : 'Other'}</span>
                {data.allowed_semesters.length > 0 && <Badge tone="outline">{groups.get(s)!.length}</Badge>}
              </div>
              {groups.get(s)!.map(({ item, elective }) => row(item, elective))}
            </div>
          ))}
        </div>
      )}
      <div>
        <div className="input-icon">
          <Search />
          <input className="input" placeholder="Another course? Search by code or name" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {query.trim() && (
          <div className="picker-list">
            {(search.data?.courses ?? []).map((c) => {
              const done = c.completed || c.in_progress
              const on = selected.includes(c.id)
              return (
                <button key={c.id} className={on ? 'on' : ''} disabled={done} style={{ opacity: done ? 0.5 : 1 }} onClick={() => onToggle(c)}>
                  <span className="color-dot" style={{ background: courseColor(c.code) }} />
                  <b className="mono" style={{ fontSize: 12 }}>{c.code}</b>
                  <span className="grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                  {c.completed ? <Badge tone="success">Completed</Badge> : c.in_progress ? <Badge tone="warning">Taking now</Badge> : !c.in_curriculum ? <Badge tone="outline">Not in plan</Badge> : on ? <CheckCircle2 size={15} color="var(--accent-strong)" /> : <Plus size={15} className="faint" />}
                </button>
              )
            })}
            {search.data && search.data.courses.length === 0 && <p className="muted" style={{ padding: 12, fontSize: 13 }}>Nothing found.</p>}
          </div>
        )}
      </div>
    </div>
  )
}
