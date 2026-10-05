import { useState } from 'react'
import { FileCheck2, Plus, Scale, ShieldQuestion, Trash2 } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorState, Field, LoadingCards, Modal, PageHead } from '../../components/ui'
import RequestModal from '../../components/RequestModal'
import { useApp, useToast } from '../../context/app'
import { del, errorText, get } from '../../lib/api'
import { dateText } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { OverrideRequestT } from '../../lib/types'

function StatusBadge({ status }: { status: OverrideRequestT['status'] }) {
  return <Badge tone={status === 'approved' ? 'success' : status === 'rejected' ? 'danger' : 'warning'}>{status}</Badge>
}

export default function Requests() {
  const { termId } = useApp()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => get<{ requests: OverrideRequestT[] }>('/api/requests'), [])
  const [choosing, setChoosing] = useState(false)
  const [kind, setKind] = useState<'credit_overload' | 'prerequisite_waiver' | null>(null)
  const [course, setCourse] = useState<{ id: number; code: string; title: string } | null>(null)
  const [courseQuery, setCourseQuery] = useState('')
  const courses = useAsync(
    () => (courseQuery.length > 1 ? get<{ courses: { id: number; code: string; title: string }[] }>(`/api/courses?q=${encodeURIComponent(courseQuery)}`) : Promise.resolve({ courses: [] })),
    [courseQuery],
  )

  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <PageHead
        title="Advisor requests"
        lead="Ask your academic advisor for a credit overload or a prerequisite waiver. Approved requests unlock registration automatically."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setChoosing(true)}>
            New request
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingCards count={2} height={120} />
      ) : !data?.requests.length ? (
        <Card>
          <Empty icon={<FileCheck2 />} title="No requests yet">
            When you need to exceed the credit limit or skip a prerequisite, send a request here — your advisor sees it instantly.
          </Empty>
        </Card>
      ) : (
        <div className="stack">
          {data.requests.map((r) => (
            <Card key={r.id} className="req">
              <div>
                <div className="row wrap" style={{ gap: 8 }}>
                  <StatusBadge status={r.status} />
                  <b style={{ fontSize: 15 }}>
                    {r.kind === 'credit_overload' ? `Credit overload to ${r.requested_ects} ECTS` : `Prerequisite waiver · ${r.course?.code} ${r.course?.title}`}
                  </b>
                </div>
                <div className="facts">
                  <span>Term <b>{r.term.name}</b></span>
                  <span>Sent <b>{dateText(r.created_at)}</b></span>
                  {r.advisor && <span>Reviewed by <b>{r.advisor.name}</b></span>}
                </div>
                <blockquote>{r.reason}</blockquote>
                {r.feedback && (
                  <blockquote style={{ borderLeftColor: r.status === 'approved' ? 'var(--success)' : 'var(--danger)' }}>
                    <b>Advisor feedback:</b> {r.feedback}
                  </blockquote>
                )}
              </div>
              {r.status === 'pending' && (
                <div>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Trash2 />}
                    onClick={async () => {
                      try {
                        await del(`/api/requests/${r.id}`)
                        toast('success', 'Request cancelled')
                        void reload()
                      } catch (e) {
                        toast('error', errorText(e))
                      }
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {choosing && (
        <Modal title="What do you need?" onClose={() => setChoosing(false)}>
          <div className="stack" style={{ paddingBottom: 18 }}>
            <button className="card interactive pad" style={{ textAlign: 'left' }} onClick={() => { setChoosing(false); setKind('credit_overload') }}>
              <div className="row"><Scale size={20} color="var(--accent-strong)" /><h3>Credit overload</h3></div>
              <p className="muted" style={{ fontSize: 13, marginTop: 6 }}>Take more than the standard ECTS limit this term.</p>
            </button>
            <div className="card pad">
              <div className="row"><ShieldQuestion size={20} color="var(--accent-strong)" /><h3>Prerequisite waiver</h3></div>
              <Field label="Course">
                <input className="input" placeholder="Search course code, e.g. CSS 302" value={courseQuery} onChange={(e) => setCourseQuery(e.target.value)} />
              </Field>
              {(courses.data?.courses ?? []).length > 0 && (
                <div className="picker-list">
                  {courses.data!.courses.slice(0, 6).map((c) => (
                    <button key={c.id} onClick={() => { setCourse(c); setChoosing(false); setKind('prerequisite_waiver') }}>
                      <b className="mono" style={{ fontSize: 12 }}>{c.code}</b> {c.title}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Modal>
      )}
      {kind && (
        <RequestModal
          kind={kind}
          termId={termId}
          course={course ?? undefined}
          onClose={() => { setKind(null); setCourse(null) }}
          onSent={reload}
        />
      )}
    </>
  )
}
