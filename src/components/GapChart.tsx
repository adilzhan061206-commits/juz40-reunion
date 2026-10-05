import { Link } from 'react-router-dom'
import { CheckCircle2 } from 'lucide-react'
import { StackedBar } from './ui'
import type { AuditGroup, AuditItem } from '../lib/types'

export function GapChart({
  groups,
  selected,
  onSelect,
}: {
  groups: AuditGroup[]
  selected: number | null
  onSelect: (id: number | null) => void
}) {
  return (
    <div className="stack sm">
      {groups.map((g) => (
        <button key={g.id} className={`gap-row ${selected === g.id ? 'on' : ''}`} onClick={() => onSelect(selected === g.id ? null : g.id)}>
          <div className="name">
            {g.name}
            <small>
              {g.category_label}
              {g.kind === 'elective' ? ' · choose any' : ''}
            </small>
          </div>
          <StackedBar done={g.completed_ects} wip={g.in_progress_ects} missing={g.missing_ects} total={g.required_ects} />
          <div className="nums">
            {g.satisfied ? (
              <span style={{ color: 'var(--success)', fontWeight: 650 }}>
                <CheckCircle2 size={14} style={{ verticalAlign: '-2px' }} /> Done
              </span>
            ) : (
              <>
                <b>{g.missing_ects}</b> ECTS left
              </>
            )}
            <div>
              {g.completed_ects}/{g.required_ects}
            </div>
          </div>
        </button>
      ))}
      <div className="legend" style={{ padding: '6px 14px 0' }}>
        <span><i style={{ background: 'var(--success)' }} /> Completed</span>
        <span><i style={{ background: 'var(--accent)' }} /> In progress / registered</span>
        <span><i style={{ background: 'var(--danger-soft)', boxShadow: 'inset 0 0 0 1px var(--danger)' }} /> Missing</span>
      </div>
    </div>
  )
}

export function CourseTiles({ items, upcoming, linkToRegistration }: { items: AuditItem[]; upcoming?: string; linkToRegistration?: boolean }) {
  return (
    <div className="course-grid">
      {items.map((i) => (
        <div key={i.course_id} className={`course-tile ${i.status}`}>
          <span className={`status-dot ${i.status}`} />
          <div className="grow">
            <b>{i.code}</b>
            <span className="ttl">{i.title}</span>
            <span className="sub">
              {i.ects} ECTS
              {i.semester ? ` · Sem ${i.semester}` : ''}
              {i.grade ? ` · Grade ${i.grade}` : ''}
              {i.status === 'in_progress' ? ' · In progress' : ''}
            </span>
            {i.status === 'missing' && i.offered && (
              <span className="sub" style={{ color: i.has_open_seat ? 'var(--success)' : 'var(--warning)', fontWeight: 600 }}>
                {linkToRegistration ? (
                  <Link to={`/registration?course=${encodeURIComponent(i.code)}`}>
                    {i.has_open_seat ? `Offered${upcoming ? ` in ${upcoming}` : ''} →` : 'Offered · sections full'}
                  </Link>
                ) : i.has_open_seat ? (
                  `Available${upcoming ? ` in ${upcoming}` : ''}`
                ) : (
                  'Offered · sections full'
                )}
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
