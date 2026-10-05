import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ExternalLink, Inbox, Scale, ShieldQuestion, X } from 'lucide-react'
import { Badge, Button, Card, Empty, ErrorState, Field, LoadingCards, Modal, Notice, PageHead, PrereqBadge, Tabs } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { errorText, get, post } from '../../lib/api'
import { initials, timeAgo } from '../../lib/format'
import { useAsync, useInterval } from '../../lib/hooks'
import type { OverrideRequestT } from '../../lib/types'

type Status = 'pending' | 'approved' | 'rejected' | 'all'

export default function AdvisorQueue() {
  const { user } = useApp()
  const toast = useToast()
  const [status, setStatus] = useState<Status>('pending')
  const { data, error, loading, reload } = useAsync(
    () => get<{ requests: OverrideRequestT[]; counts: Record<string, number> }>(`/api/advisor/requests?status=${status}`),
    [status],
  )
  const [decision, setDecision] = useState<{ request: OverrideRequestT; action: 'approve' | 'reject' } | null>(null)
  useInterval(reload, 15000)

  if (error) return <ErrorState message={error} onRetry={reload} />
  const counts = data?.counts ?? {}

  return (
    <>
      <PageHead
        eyebrow={user?.department?.name}
        title="Approval queue"
        lead="Credit overloads and prerequisite waivers from students in your department. Decisions unlock or keep registration blocked instantly, and students are notified by e-mail."
      />
      <Tabs
        value={status}
        onChange={setStatus}
        tabs={[
          { value: 'pending', label: 'Pending', count: counts.pending },
          { value: 'approved', label: 'Approved' },
          { value: 'rejected', label: 'Rejected' },
          { value: 'all', label: 'All' },
        ]}
      />
      {loading && !data ? (
        <LoadingCards count={3} height={150} />
      ) : !data?.requests.length ? (
        <Card>
          <Empty icon={<Inbox />} title={status === 'pending' ? 'Inbox zero' : 'Nothing here'}>
            {status === 'pending' ? 'New requests from your students appear here in real time.' : 'No requests with this status.'}
          </Empty>
        </Card>
      ) : (
        <div className="stack">
          {data.requests.map((r) => (
            <Card key={r.id} className="req">
              <div>
                <div className="row wrap" style={{ gap: 10 }}>
                  <div className="avatar">{initials(r.student.name)}</div>
                  <div>
                    <div className="row wrap" style={{ gap: 8 }}>
                      <b style={{ fontSize: 15 }}>{r.student.name}</b>
                      <Badge tone={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'}>{r.status}</Badge>
                    </div>
                    <div className="muted" style={{ fontSize: 12.5 }}>
                      {r.student.program ?? 'No programme'} {r.student.sdu_id ? `· SDU ${r.student.sdu_id}` : ''} · {timeAgo(r.created_at)}
                    </div>
                  </div>
                </div>
                <div className="row wrap" style={{ gap: 8, marginTop: 14 }}>
                  {r.kind === 'credit_overload' ? (
                    <Badge tone="accent" icon={<Scale />}>Credit overload → {r.requested_ects} ECTS</Badge>
                  ) : (
                    <Badge tone="info" icon={<ShieldQuestion />}>Prerequisite waiver · {r.course?.code} {r.course?.title}</Badge>
                  )}
                  <Badge tone="outline">{r.term.name}</Badge>
                  {r.current_ects !== undefined && <Badge tone="outline">Registered now: {r.current_ects} ECTS</Badge>}
                  {r.prerequisite && <PrereqBadge check={r.prerequisite} />}
                </div>
                <blockquote>{r.reason}</blockquote>
                {r.feedback && (
                  <blockquote style={{ borderLeftColor: r.status === 'approved' ? 'var(--success)' : 'var(--danger)' }}>
                    <b>{r.advisor?.name ?? 'Advisor'}:</b> {r.feedback}
                  </blockquote>
                )}
              </div>
              <div className="stack sm" style={{ minWidth: 170 }}>
                {r.status === 'pending' && (
                  <>
                    <Button variant="success" icon={<Check />} onClick={() => setDecision({ request: r, action: 'approve' })}>
                      Approve Override
                    </Button>
                    <Button variant="danger" icon={<X />} onClick={() => setDecision({ request: r, action: 'reject' })}>
                      Reject Override
                    </Button>
                  </>
                )}
                <Link to={`/advisor/students/${r.student.id}`}>
                  <Button variant="ghost" block icon={<ExternalLink />}>Degree audit</Button>
                </Link>
              </div>
            </Card>
          ))}
        </div>
      )}
      {decision && (
        <DecisionModal
          {...decision}
          onClose={() => setDecision(null)}
          onDone={(message) => {
            setDecision(null)
            toast('success', message)
            void reload()
          }}
        />
      )}
    </>
  )
}

function DecisionModal({
  request,
  action,
  onClose,
  onDone,
}: {
  request: OverrideRequestT
  action: 'approve' | 'reject'
  onClose: () => void
  onDone: (message: string) => void
}) {
  const [feedback, setFeedback] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reject = action === 'reject'

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      await post(`/api/advisor/requests/${request.id}/${action}`, { feedback })
      onDone(reject ? `Request from ${request.student.name} rejected` : `Override approved for ${request.student.name}`)
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={reject ? 'Reject override' : 'Approve override'}
      subtitle={
        reject
          ? 'Feedback is mandatory and is e-mailed to the student. The course stays locked.'
          : 'Registration for the flagged course unlocks immediately on the student portal.'
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant={reject ? 'danger' : 'success'} loading={busy} disabled={reject && feedback.trim().length < 5} onClick={submit}>
            {reject ? 'Reject and send feedback' : 'Approve'}
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Notice tone="danger">{error}</Notice>}
        <Field label={reject ? 'Feedback for the student (required)' : 'Note for the student (optional)'}>
          <textarea className="textarea" value={feedback} onChange={(e) => setFeedback(e.target.value)} autoFocus placeholder={reject ? 'Explain why and what the student can do instead…' : 'Any conditions or advice…'} />
        </Field>
      </div>
    </Modal>
  )
}
