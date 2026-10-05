import { useState } from 'react'
import { CheckCircle2, ClipboardPaste, Upload } from 'lucide-react'
import { Button, Card, CardHead, Field, Notice, PageHead } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { errorText, post } from '../../lib/api'
import type { SyncSummary } from '../../lib/types'

export default function AdminImport() {
  const { meta, reloadMeta } = useApp()
  const toast = useToast()
  const [html, setHtml] = useState('')
  const [termCode, setTermCode] = useState('')
  const [department, setDepartment] = useState('')
  const [capacity, setCapacity] = useState('30')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<SyncSummary | null>(null)

  const submit = async () => {
    setBusy(true)
    setResult(null)
    try {
      const summary = await post<SyncSummary>('/api/admin/import/schedule', {
        html,
        term_code: termCode || undefined,
        department_id: department ? Number(department) : undefined,
        capacity: Number(capacity) || 30,
      })
      setResult(summary)
      await reloadMeta()
      toast('success', 'Timetable imported', `${summary.sections} new sections in ${summary.term}`)
    } catch (e) {
      toast('error', 'Import failed', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <PageHead
        title="Import from my.sdu.edu.kz"
        lead="Students' own schedules and grades are synced automatically when they sign in. Use this page to load a whole timetable grid into the shared catalogue so everyone can see all sections."
      />
      <div className="split">
        <Card>
          <CardHead title="Schedule grid" icon={<ClipboardPaste />} />
          <div className="card-body stack">
            {result && (
              <Notice tone="success" title={`Imported into ${result.term}:`}>
                {result.courses} new courses · {result.sections} new sections
                {result.warnings.length > 0 && ` · ${result.warnings.join(' ')}`}
              </Notice>
            )}
            <Field label="Page HTML" help="Open the schedule on my.sdu.edu.kz, view source (Ctrl+U), copy all and paste. Cells like “CSS 222 Algorithms 1 (2+2+0) [4cr / 5ECTS] [02-N] Instructor : E221” are recognised.">
              <textarea className="textarea mono" style={{ minHeight: 260, fontSize: 12 }} value={html} onChange={(e) => setHtml(e.target.value)} placeholder='<table class="clTbl">…' />
            </Field>
            <div className="grid cols-3" style={{ gap: 12 }}>
              <Field label="Term" help="Detected from the page when empty">
                <select className="select" value={termCode} onChange={(e) => setTermCode(e.target.value)}>
                  <option value="">Auto-detect</option>
                  {meta?.terms.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
                </select>
              </Field>
              <Field label="Department">
                <select className="select" value={department} onChange={(e) => setDepartment(e.target.value)}>
                  <option value="">Keep as is</option>
                  {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              </Field>
              <Field label="Default capacity">
                <input className="input" type="number" min={1} max={500} value={capacity} onChange={(e) => setCapacity(e.target.value)} />
              </Field>
            </div>
            <div>
              <Button variant="primary" icon={<Upload />} loading={busy} disabled={html.length < 20} onClick={submit}>Import timetable</Button>
            </div>
          </div>
        </Card>
        <Card pad="lg">
          <h3>How syncing works</h3>
          <div className="stack" style={{ marginTop: 14, fontSize: 13.5 }}>
            {[
              'Students sign in with their SDU ID and portal password. The server logs in to my.sdu.edu.kz on their behalf, once.',
              'Their current-term schedule, transcript and in-progress grades are imported; the password is discarded immediately.',
              'Sections seen on the portal are merged into the shared catalogue, so the timetable fills up as students sign in.',
              'For the full timetable before registration opens, paste a schedule grid here.',
            ].map((text, i) => (
              <div key={i} className="row" style={{ alignItems: 'flex-start' }}>
                <CheckCircle2 size={17} color="var(--success)" style={{ flex: 'none', marginTop: 2 }} />
                <span className="muted">{text}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  )
}
