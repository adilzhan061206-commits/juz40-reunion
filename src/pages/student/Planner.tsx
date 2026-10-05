import { useState } from 'react'
import { AlertTriangle, CalendarRange, Plus, Trash2, X } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, Field, LoadingCards, Modal, Notice, PageHead } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { del, errorText, get, patch, post, put } from '../../lib/api'
import { courseColor, ects, timeAgo } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import { useCurriculum } from '../../lib/curriculum'
import CurriculumPicker from '../../components/CurriculumPicker'
import type { PlanT } from '../../lib/types'

export default function Planner() {
  const { meta } = useApp()
  const toast = useToast()
  const { data, error, loading, reload } = useAsync(() => get<{ plans: PlanT[] }>('/api/plans'), [])
  const [creating, setCreating] = useState(false)
  const [activeId, setActiveId] = useState<number | null>(null)

  const plans = data?.plans ?? []
  const active = plans.find((p) => p.id === activeId) ?? plans[0]
  const futureTerms = (meta?.terms ?? []).filter((t) => !t.is_current && t.start_date > new Date().toISOString().slice(0, 10))

  const update = (plan: PlanT) => {
    if (!data) return
    void reload()
    setActiveId(plan.id)
  }

  if (error) return <ErrorState message={error} onRetry={reload} />

  return (
    <>
      <PageHead
        title="Multi-term planner"
        lead="Draft tentative schedules for upcoming semesters. Plans are private sketches — they never touch your confirmed enrollment."
        actions={
          <Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>
            New plan
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingCards count={2} height={160} />
      ) : plans.length === 0 ? (
        <Card>
          <Empty icon={<CalendarRange />} title="No plans yet" action={<Button variant="primary" icon={<Plus />} onClick={() => setCreating(true)}>Create your first plan</Button>}>
            Map out next semester and beyond: pick courses per term and see prerequisite chains and credit totals at a glance.
          </Empty>
        </Card>
      ) : (
        <div className="split left">
          <div className="stack">
            {plans.map((p) => (
              <button
                key={p.id}
                className={`card interactive pad`}
                style={{ textAlign: 'left', borderColor: active?.id === p.id ? 'var(--accent-strong)' : undefined, boxShadow: active?.id === p.id ? 'var(--ring)' : undefined }}
                onClick={() => setActiveId(p.id)}
              >
                <div className="row between">
                  <Badge tone="outline">{p.term.name}</Badge>
                  <span className="faint" style={{ fontSize: 12 }}>edited {timeAgo(p.updated_at)}</span>
                </div>
                <h3 style={{ marginTop: 10 }}>{p.name}</h3>
                <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
                  {p.items.length} courses · {ects(p.ects)}
                </div>
                <div className="row wrap" style={{ gap: 4, marginTop: 10 }}>
                  {p.items.slice(0, 6).map((i) => (
                    <span key={i.course.id} className="color-dot" style={{ background: courseColor(i.course.code), width: 18, height: 6, borderRadius: 3 }} />
                  ))}
                </div>
              </button>
            ))}
          </div>
          {active && <PlanEditor key={active.id} plan={active} onChange={update} onDelete={async () => {
            await del(`/api/plans/${active.id}`)
            toast('success', 'Plan deleted')
            setActiveId(null)
            void reload()
          }} />}
        </div>
      )}
      {creating && (
        <CreatePlan
          terms={futureTerms.length ? futureTerms : meta?.terms ?? []}
          onClose={() => setCreating(false)}
          onCreated={(p) => {
            setCreating(false)
            setActiveId(p.id)
            void reload()
          }}
        />
      )}
    </>
  )
}

function CreatePlan({ terms, onClose, onCreated }: { terms: { id: number; name: string }[]; onClose: () => void; onCreated: (p: PlanT) => void }) {
  const toast = useToast()
  const [termId, setTermId] = useState(terms[0]?.id ?? 0)
  const [name, setName] = useState(`${terms[0]?.name ?? 'Next term'} plan`)
  const [busy, setBusy] = useState(false)
  return (
    <Modal
      title="New tentative plan"
      subtitle="Saved for the selected semester. Your current enrollment is not affected."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button
            variant="primary"
            loading={busy}
            disabled={!name.trim() || !termId}
            onClick={async () => {
              setBusy(true)
              try {
                onCreated(await post<PlanT>('/api/plans', { term_id: termId, name }))
              } catch (e) {
                toast('error', errorText(e))
              } finally {
                setBusy(false)
              }
            }}
          >
            Create plan
          </Button>
        </>
      }
    >
      <div className="stack">
        <Field label="Semester">
          <select className="select" value={termId} onChange={(e) => {
            const id = Number(e.target.value)
            setTermId(id)
            setName(`${terms.find((t) => t.id === id)?.name ?? ''} plan`)
          }}>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </Field>
        <Field label="Plan name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </Field>
      </div>
    </Modal>
  )
}

function PlanEditor({ plan, onChange, onDelete }: { plan: PlanT; onChange: (p: PlanT) => void; onDelete: () => void }) {
  const toast = useToast()
  const curriculum = useCurriculum(plan.term.id)
  const [name, setName] = useState(plan.name)
  const [notes, setNotes] = useState(plan.notes)
  const saveItems = async (courseIds: number[]) => {
    try {
      onChange(await put<PlanT>(`/api/plans/${plan.id}/items`, { items: courseIds.map((id) => ({ course_id: id })) }))
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const saveMeta = async () => {
    if (name === plan.name && notes === plan.notes) return
    try {
      onChange(await patch<PlanT>(`/api/plans/${plan.id}`, { name, notes }))
      toast('success', 'Plan saved')
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  const ids = plan.items.map((i) => i.course.id)

  return (
    <Card>
      <CardHead
        title={<input className="input" style={{ height: 36, fontWeight: 650, fontSize: 16, border: 'none', padding: 0, background: 'transparent' }} value={name} onChange={(e) => setName(e.target.value)} onBlur={saveMeta} />}
        action={<Button size="sm" variant="danger" icon={<Trash2 />} onClick={onDelete}>Delete</Button>}
      />
      <div className="card-body stack lg">
        <Notice tone="info">
          Tentative plan for <b>{plan.term.name}</b> · {plan.items.length} courses · {ects(plan.ects)}. Nothing here registers you for
          classes.
        </Notice>
        <div className="stack sm">
          <span className="field-label">
            Add from your curriculum{curriculum.data?.allowed_semesters.length ? ` · semesters ${curriculum.data.allowed_semesters.join(', ')}` : ''}
          </span>
          <CurriculumPicker
            data={curriculum.data}
            termId={plan.term.id}
            requireSections={false}
            selected={ids}
            onToggle={(c) => saveItems(ids.includes(c.id) ? ids.filter((x) => x !== c.id) : [...ids, c.id])}
          />
        </div>
        {plan.items.length === 0 ? (
          <p className="muted" style={{ fontSize: 13.5 }}>Nothing planned yet — pick courses from your curriculum above.</p>
        ) : (
          <div className="stack sm">
            {plan.items.map((i) => (
              <div key={i.course.id} className="selected-course">
                <span className="color-dot" style={{ background: courseColor(i.course.code) }} />
                <div className="grow">
                  <div className="row wrap" style={{ gap: 6 }}>
                    <b className="mono" style={{ fontSize: 12.5 }}>{i.course.code}</b>
                    <span style={{ fontSize: 13.5 }}>{i.course.title}</span>
                  </div>
                  <div className="row wrap" style={{ gap: 6, marginTop: 4 }}>
                    <Badge tone="outline">{ects(i.course.ects)}</Badge>
                    {i.offered ? <Badge tone="success">Projected offering</Badge> : <Badge tone="warning">Not offered this term</Badge>}
                    {i.completed && <Badge tone="info">Already completed</Badge>}
                    {i.missing_prerequisites.length > 0 && (
                      <Badge tone="danger" icon={<AlertTriangle />}>Needs {i.missing_prerequisites.join(', ')} first</Badge>
                    )}
                  </div>
                </div>
                <button className="btn ghost sm icon" onClick={() => saveItems(ids.filter((x) => x !== i.course.id))} aria-label="Remove">
                  <X />
                </button>
              </div>
            ))}
          </div>
        )}
        <Field label="Notes">
          <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveMeta} placeholder="Ideas, alternatives, questions for your advisor…" />
        </Field>
      </div>
    </Card>
  )
}
