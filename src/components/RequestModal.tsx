import { useState } from 'react'
import { Send } from 'lucide-react'
import { Button, Field, Modal, Notice } from './ui'
import { useToast } from '../context/app'
import { errorText, post } from '../lib/api'

export default function RequestModal({
  kind,
  termId,
  course,
  suggestedEcts,
  onClose,
  onSent,
}: {
  kind: 'credit_overload' | 'prerequisite_waiver'
  termId: number | null
  course?: { id: number; code: string; title: string }
  suggestedEcts?: number
  onClose: () => void
  onSent?: () => void
}) {
  const toast = useToast()
  const [reason, setReason] = useState('')
  const [ectsValue, setEcts] = useState(String(suggestedEcts ?? 45))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const send = async () => {
    setBusy(true)
    setError(null)
    try {
      await post('/api/requests', {
        kind,
        term_id: termId,
        course_id: course?.id,
        requested_ects: kind === 'credit_overload' ? Number(ectsValue) : undefined,
        reason,
      })
      toast('success', 'Request sent to your advisor', 'You will be notified as soon as it is reviewed.')
      onSent?.()
      onClose()
    } catch (e) {
      setError(errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title={kind === 'credit_overload' ? 'Request a credit overload' : `Request a prerequisite waiver`}
      subtitle={
        kind === 'credit_overload'
          ? 'Your advisor reviews the request online. Once approved, registration above the standard limit unlocks automatically.'
          : `Ask your advisor to let you take ${course?.code} ${course?.title} without the listed prerequisite.`
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Send />} loading={busy} disabled={reason.trim().length < 10} onClick={send}>
            Send request
          </Button>
        </>
      }
    >
      <div className="stack">
        {error && <Notice tone="danger">{error}</Notice>}
        {kind === 'credit_overload' && (
          <Field label="Total ECTS you want to take this term">
            <input className="input" type="number" min={1} max={80} value={ectsValue} onChange={(e) => setEcts(e.target.value)} />
          </Field>
        )}
        <Field label="Why do you need this?" help="At least 10 characters. Mention grades, graduation plans or equivalent courses.">
          <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="I need this course to graduate on time because…" />
        </Field>
      </div>
    </Modal>
  )
}
