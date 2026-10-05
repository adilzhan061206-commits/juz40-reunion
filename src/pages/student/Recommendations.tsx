import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, CheckCircle2, Lock, ShieldQuestion, Sparkles, Users } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, LoadingCards, Notice, PageHead } from '../../components/ui'
import RequestModal from '../../components/RequestModal'
import { useApp } from '../../context/app'
import { get } from '../../lib/api'
import { courseColor, ects } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { Recommendation } from '../../lib/types'

interface RecData {
  recommendations: Recommendation[]
  locked: Recommendation[]
  warnings: string[]
  audit_ready: boolean
  term?: { id: number; name: string }
}

export default function Recommendations() {
  const { termId } = useApp()
  const { data, error, loading, reload } = useAsync(() => get<RecData>(`/api/recommendations?term_id=${termId ?? ''}`), [termId])
  const [waiver, setWaiver] = useState<Recommendation | null>(null)

  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !data) return <LoadingCards count={4} height={96} />
  if (!data) return null

  return (
    <>
      <PageHead
        eyebrow={data.term ? `For ${data.term.name}` : undefined}
        title="Recommended courses"
        lead="Ranked from your degree gaps: required core first, courses planned for your current semester, and courses that unlock the most future requirements. Completed and unrelated courses are never suggested."
        actions={
          <Link to="/generator">
            <Button variant="accent" icon={<Sparkles />}>Turn into a schedule</Button>
          </Link>
        }
      />
      <div className="stack lg">
        {data.warnings.map((w) => (
          <Notice key={w} tone="warning">{w}</Notice>
        ))}
        {!data.audit_ready ? (
          <Card>
            <Empty icon={<Sparkles />} title="Degree audit needed first" action={<Link to="/profile"><Button variant="primary">Complete profile</Button></Link>}>
              Recommendations are generated after your degree gap analysis. Choose your programme and sync your transcript.
            </Empty>
          </Card>
        ) : data.recommendations.length === 0 ? (
          <Card>
            <Empty icon={<CheckCircle2 />} title="Nothing to recommend">
              Either every requirement offered this term is already covered, or the remaining courses are locked by prerequisites.
            </Empty>
          </Card>
        ) : (
          <Card>
            <div className="list">
              {data.recommendations.map((r, i) => (
                <div key={r.course_id} className="item rec" style={{ animation: `fade-up .35s ${i * 40}ms both` }}>
                  <div className="match" style={i === 0 ? { background: 'var(--accent)', color: 'var(--accent-ink)' } : undefined}>
                    <div>
                      {r.match}%<small>MATCH</small>
                    </div>
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <span className="color-dot" style={{ background: courseColor(r.code) }} />
                      <span className="code-tag">{r.code}</span>
                      <b style={{ fontSize: 15 }}>{r.title}</b>
                    </div>
                    <div className="row wrap" style={{ gap: 6, marginTop: 8 }}>
                      <Badge tone="accent">{r.fulfills}</Badge>
                      <Badge tone="outline">{ects(r.ects)}</Badge>
                      {r.semester && <Badge tone="outline">Semester {r.semester}</Badge>}
                      {r.prerequisite.status === 'provisional' && <Badge tone="warning">Provisional prerequisites</Badge>}
                      {!r.has_open_seat && <Badge tone="danger" icon={<Users />}>Full</Badge>}
                      {r.in_cart && <Badge tone="dark">In draft</Badge>}
                    </div>
                    <div className="reasons">
                      {r.reasons?.map((reason) => (
                        <span key={reason}>
                          <CheckCircle2 /> {reason}
                        </span>
                      ))}
                    </div>
                  </div>
                  <Link to={`/registration?course=${encodeURIComponent(r.code)}`}>
                    <Button variant={i === 0 ? 'primary' : 'default'}>
                      View sections <ArrowRight />
                    </Button>
                  </Link>
                </div>
              ))}
            </div>
          </Card>
        )}

        {data.locked.length > 0 && (
          <Card>
            <CardHead title="Needed, but locked by prerequisites" icon={<Lock />} />
            <div className="list" style={{ marginTop: 8 }}>
              {data.locked.map((r) => (
                <div key={r.course_id} className="item">
                  <span className="code-tag">{r.code}</span>
                  <div className="grow">
                    <b style={{ fontSize: 13.5 }}>{r.title}</b>
                    <div style={{ fontSize: 12.5, color: 'var(--danger)' }}>{r.prerequisite.message}</div>
                  </div>
                  <Button size="sm" variant="ghost" icon={<ShieldQuestion />} onClick={() => setWaiver(r)}>
                    Request waiver
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
      {waiver && (
        <RequestModal
          kind="prerequisite_waiver"
          termId={termId}
          course={{ id: waiver.course_id, code: waiver.code, title: waiver.title }}
          onClose={() => setWaiver(null)}
        />
      )}
    </>
  )
}
