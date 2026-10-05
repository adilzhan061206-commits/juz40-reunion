import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Search, Users } from 'lucide-react'
import { Badge, Card, Empty, ErrorState, LoadingCards, PageHead, StackedBar } from '../../components/ui'
import { get } from '../../lib/api'
import { initials } from '../../lib/format'
import { useAsync, useDebounced } from '../../lib/hooks'
import type { User } from '../../lib/types'

interface StudentRow extends User {
  audit: { required: number; completed: number; in_progress: number; missing: number; percent: number }
  pending_requests: number
}

export default function AdvisorStudents() {
  const [query, setQuery] = useState('')
  const q = useDebounced(query, 220)
  const { data, error, loading, reload } = useAsync(
    () => get<{ students: StudentRow[]; department: string | null }>(`/api/advisor/students?q=${encodeURIComponent(q)}`),
    [q],
  )
  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <PageHead eyebrow={data?.department ?? undefined} title="My students" lead="Every student in your department with their degree progress. Open a profile for the visual gap breakdown." />
      <Card pad>
        <div className="input-icon" style={{ marginBottom: 6 }}>
          <Search />
          <input className="input" placeholder="Search by name, e-mail or SDU ID" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </Card>
      <div style={{ marginTop: 16 }}>
        {loading && !data ? (
          <LoadingCards count={5} height={64} />
        ) : !data?.students.length ? (
          <Card><Empty icon={<Users />} title="No students found" /></Card>
        ) : (
          <Card>
            <div className="list">
              {data.students.map((s) => (
                <Link key={s.id} to={`/advisor/students/${s.id}`} className="item" style={{ gap: 16 }}>
                  <div className="avatar">{initials(s.name)}</div>
                  <div style={{ minWidth: 180 }}>
                    <b style={{ fontSize: 14 }}>{s.name}</b>
                    <div className="muted" style={{ fontSize: 12.5 }}>{s.sdu_id ? `SDU ${s.sdu_id}` : s.email ?? '—'}</div>
                  </div>
                  <div className="grow hide-sm">
                    <StackedBar className="progress lg" done={s.audit.completed} wip={s.audit.in_progress} missing={0} total={s.audit.required} />
                  </div>
                  <b style={{ width: 54, textAlign: 'right' }}>{Math.round(s.audit.percent)}%</b>
                  {s.pending_requests > 0 && <Badge tone="warning">{s.pending_requests} pending</Badge>}
                  {s.financial_hold && <Badge tone="danger">Hold</Badge>}
                  <ArrowRight size={16} className="faint" />
                </Link>
              ))}
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
