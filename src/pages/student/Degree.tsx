import { useState } from 'react'
import { Link } from 'react-router-dom'
import { BarChart3, FileUp, GraduationCap, ScrollText, Trash2 } from 'lucide-react'
import { Badge, Button, Card, CardHead, Empty, ErrorState, LoadingCards, Notice, PageHead, Ring, Tabs } from '../../components/ui'
import { CourseTiles, GapChart } from '../../components/GapChart'
import { useApp, useToast } from '../../context/app'
import { del, errorText, get, post } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import type { Audit } from '../../lib/types'

interface TranscriptRow {
  id: number
  code: string
  title: string
  ects: number
  credits: number
  grade: string | null
  status: string
  term: string
  source: string
}

export default function Degree() {
  const { refreshUser } = useApp()
  const toast = useToast()
  const audit = useAsync(() => get<Audit>('/api/degree/audit'), [])
  const [tab, setTab] = useState<'requirements' | 'transcript' | 'import'>('requirements')
  const [selected, setSelected] = useState<number | null>(null)

  if (audit.error) return <ErrorState message={audit.error} onRetry={audit.reload} />
  if (audit.loading && !audit.data) return <LoadingCards count={3} height={180} />
  const data = audit.data!
  const t = data.totals
  const groups = selected ? data.groups.filter((g) => g.id === selected) : data.groups

  return (
    <>
      <PageHead
        eyebrow={data.program ? (data.program.personal ? 'Personal curriculum' : 'Degree programme') : undefined}
        title={data.program?.name ?? 'Degree progress'}
        lead="Your transcript from my.sdu.edu.kz mapped against every requirement of your programme — what's done, what's in progress, and exactly what is left."
      />

      <div className="stack lg">
        {data.warnings.map((w) => (
          <Notice key={w} tone="warning">
            {w}{' '}
            <Link to="/profile" className="link">Open profile</Link>
          </Notice>
        ))}

        {data.program && (
          <div className="grid degree-top">
            <Card pad="lg">
              <div className="stack" style={{ alignItems: 'center', textAlign: 'center' }}>
                <Ring value={t.percent} secondary={t.required ? (t.in_progress / t.required) * 100 : 0} size={170} stroke={16} sub="of requirements" />
                <div className="grid cols-3" style={{ width: '100%', gap: 8, marginTop: 6 }}>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--success)' }}>{t.completed}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>completed</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--accent-strong)' }}>{t.in_progress}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>in progress</div>
                  </div>
                  <div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--danger)' }}>{t.missing}</div>
                    <div className="muted" style={{ fontSize: 11.5 }}>missing</div>
                  </div>
                </div>
                <span className="faint" style={{ fontSize: 12 }}>ECTS across {data.groups.length} requirement groups</span>
              </div>
            </Card>
            <Card>
              <CardHead title="Requirements breakdown" icon={<BarChart3 />} action={selected && <Button size="sm" variant="ghost" onClick={() => setSelected(null)}>Show all</Button>} />
              <div className="card-body">
                <GapChart groups={data.groups} selected={selected} onSelect={setSelected} />
              </div>
            </Card>
          </div>
        )}

        <div>
          <Tabs
            value={tab}
            onChange={setTab}
            tabs={[
              { value: 'requirements', label: 'Requirements' },
              { value: 'transcript', label: 'Transcript' },
              { value: 'import', label: 'Import curriculum' },
            ]}
          />
          {tab === 'requirements' &&
            (data.program ? (
              <div className="stack lg">
                {groups.map((g) => (
                  <Card key={g.id}>
                    <CardHead
                      title={g.name}
                      action={
                        g.satisfied ? (
                          <Badge tone="success">Satisfied</Badge>
                        ) : (
                          <Badge tone="danger">{g.missing_ects} ECTS missing</Badge>
                        )
                      }
                    />
                    <div className="card-body">
                      {g.kind === 'elective' && (
                        <p className="muted" style={{ fontSize: 13, marginBottom: 12 }}>
                          Choose any courses from this list worth {g.required_ects} ECTS in total.
                        </p>
                      )}
                      <CourseTiles items={g.items} upcoming={data.upcoming_term?.name} linkToRegistration />
                    </div>
                  </Card>
                ))}
                {data.other_completed.length > 0 && (
                  <Card>
                    <CardHead title="Other completed courses" />
                    <div className="card-body muted" style={{ fontSize: 13 }}>
                      {data.other_completed.map((c) => `${c.code} ${c.title} (${c.grade ?? '—'})`).join(' · ')}
                    </div>
                  </Card>
                )}
              </div>
            ) : (
              <Card>
                <Empty icon={<GraduationCap />} title="Choose your programme" action={<Link to="/profile"><Button variant="primary">Open profile</Button></Link>}>
                  Select your degree programme or import your personal curriculum to run the audit.
                </Empty>
              </Card>
            ))}
          {tab === 'transcript' && <Transcript />}
          {tab === 'import' && (
            <ImportCurriculum
              personal={!!data.program?.personal}
              onImported={async () => {
                await Promise.all([audit.reload(), refreshUser()])
                setTab('requirements')
              }}
              onRemoved={async () => {
                await Promise.all([audit.reload(), refreshUser()])
                toast('success', 'Personal curriculum removed')
              }}
            />
          )}
        </div>
      </div>
    </>
  )
}

function Transcript() {
  const { data, loading } = useAsync(() => get<{ entries: TranscriptRow[] }>('/api/transcript'), [])
  if (loading && !data) return <LoadingCards count={1} height={200} />
  const rows = data?.entries ?? []
  if (!rows.length)
    return (
      <Card>
        <Empty icon={<ScrollText />} title="No transcript yet" action={<Link to="/profile"><Button variant="primary">Sync with SDU</Button></Link>}>
          Your grades are imported automatically when you sign in with your SDU account.
        </Empty>
      </Card>
    )
  return (
    <Card>
      <div className="scroll-x">
        <table className="table">
          <thead>
            <tr>
              <th>Term</th>
              <th>Course</th>
              <th>ECTS</th>
              <th>Grade</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="mono muted">{r.term || '—'}</td>
                <td>
                  <b className="mono" style={{ fontSize: 12.5 }}>{r.code}</b> {r.title}
                </td>
                <td>{r.ects}</td>
                <td className="mono" style={{ fontWeight: 700 }}>{r.grade ?? '—'}</td>
                <td>
                  <Badge tone={r.status === 'completed' ? 'success' : r.status === 'failed' ? 'danger' : 'warning'}>
                    {r.status.replace('_', ' ')}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function ImportCurriculum({ personal, onImported, onRemoved }: { personal: boolean; onImported: () => void; onRemoved: () => void }) {
  const toast = useToast()
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)

  const upload = async (file: File | undefined) => {
    if (!file) return
    if (file.size > 1_000_000) return toast('error', 'File is larger than 1 MB')
    setBusy(true)
    try {
      const content = await file.text()
      const result = await post<{ name: string; courses: number; groups: number }>('/api/curriculum/import', { filename: file.name, content })
      toast('success', `Imported “${result.name}”`, `${result.courses} courses in ${result.groups} groups`)
      onImported()
    } catch (e) {
      toast('error', 'Import failed', errorText(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid cols-2">
      <Card pad="lg">
        <h3 style={{ marginBottom: 6 }}>Upload your curriculum</h3>
        <p className="muted" style={{ fontSize: 13.5, marginBottom: 16 }}>
          Supports the formats from the original demo: CSV with <span className="kbd">category, code, name, credits</span>, or JSON with
          categories or <span className="kbd">subjects / electives / requisite_courses</span> exported from my.sdu (statuses, grades and
          prerequisites are kept).
        </p>
        <label
          className={`dropzone ${drag ? 'drag' : ''}`}
          onDragOver={(e) => {
            e.preventDefault()
            setDrag(true)
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDrag(false)
            void upload(e.dataTransfer.files[0])
          }}
        >
          <input type="file" accept=".csv,.json,text/csv,application/json" hidden onChange={(e) => upload(e.target.files?.[0])} />
          {busy ? <span className="spinner" /> : <FileUp />}
          <div style={{ fontWeight: 650, color: 'var(--ink)' }}>Drop a CSV or JSON file, or click to choose</div>
          <div style={{ fontSize: 12.5 }}>Up to 1 MB</div>
        </label>
      </Card>
      <Card pad="lg">
        <h3 style={{ marginBottom: 6 }}>Programme vs personal curriculum</h3>
        <p className="muted" style={{ fontSize: 13.5 }}>
          By default the audit uses your programme's official requirements. A personal curriculum replaces them — useful for double
          majors, transfers or individual study plans.
        </p>
        {personal && (
          <Button
            variant="danger"
            icon={<Trash2 />}
            style={{ marginTop: 16 }}
            onClick={async () => {
              await del('/api/curriculum')
              onRemoved()
            }}
          >
            Remove personal curriculum
          </Button>
        )}
      </Card>
    </div>
  )
}
