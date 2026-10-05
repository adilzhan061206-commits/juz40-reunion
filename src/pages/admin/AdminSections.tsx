import { useState } from 'react'
import { Save, Search } from 'lucide-react'
import { Badge, Button, Card, ErrorState, LoadingCards, PageHead, SeatMeter } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { errorText, get, patch } from '../../lib/api'
import { courseColor, kindLabel, meetingText } from '../../lib/format'
import { useAsync, useDebounced } from '../../lib/hooks'
import type { SectionT, Term } from '../../lib/types'

export default function AdminSections() {
  const { termId } = useApp()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [edits, setEdits] = useState<Record<number, string>>({})
  const q = useDebounced(query, 220)
  const { data, error, loading, reload } = useAsync(
    () => get<{ term: Term; sections: SectionT[] }>(`/api/admin/sections?term_id=${termId ?? ''}&q=${encodeURIComponent(q)}`),
    [termId, q],
  )

  if (error) return <ErrorState message={error} onRetry={reload} />

  const save = async (s: SectionT) => {
    try {
      const result = await patch<{ waitlist_events: { result: string }[] }>(`/api/admin/sections/${s.id}`, { capacity: Number(edits[s.id]) })
      const enrolled = result.waitlist_events.filter((e) => e.result === 'enrolled').length
      toast('success', `Capacity updated`, enrolled ? `${enrolled} student(s) auto-enrolled from the waitlist` : undefined)
      setEdits((current) => Object.fromEntries(Object.entries(current).filter(([key]) => Number(key) !== s.id)))
      void reload()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <PageHead
        eyebrow={data?.term.name}
        title="Sections & seats"
        lead="Raising a capacity opens seats: waitlisted students are enrolled automatically in queue order, then seat-alert subscribers are notified."
      />
      <Card pad>
        <div className="input-icon">
          <Search />
          <input className="input" placeholder="Filter by course code or title" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
      </Card>
      <div style={{ marginTop: 16 }}>
        {loading && !data ? (
          <LoadingCards count={1} height={300} />
        ) : (
          <Card>
            <div className="scroll-x">
              <table className="table">
                <thead>
                  <tr><th>Course</th><th>Section</th><th>When</th><th>Seats</th><th>Waitlist</th><th style={{ textAlign: 'right' }}>Capacity</th></tr>
                </thead>
                <tbody>
                  {data?.sections.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <span className="row" style={{ gap: 8 }}>
                          <span className="color-dot" style={{ background: courseColor(s.course.code) }} />
                          <b className="mono" style={{ fontSize: 12.5 }}>{s.course.code}</b>
                          <span className="hide-sm">{s.course.title}</span>
                        </span>
                      </td>
                      <td>{kindLabel(s.kind)} <span className="mono">{s.code}</span> {s.source === 'sdu' && <Badge tone="info">SDU</Badge>}</td>
                      <td className="muted" style={{ fontSize: 12.5 }}>{s.meetings.map(meetingText).join(', ')}</td>
                      <td><SeatMeter left={s.seats_left} capacity={s.capacity} /></td>
                      <td>{s.waitlist ? <Badge tone="warning">{s.waitlist}</Badge> : <span className="faint">—</span>}</td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                          <input
                            className="input"
                            type="number"
                            min={0}
                            style={{ width: 84, height: 34 }}
                            value={edits[s.id] ?? s.capacity}
                            onChange={(e) => setEdits({ ...edits, [s.id]: e.target.value })}
                          />
                          <Button size="sm" variant="primary" icon={<Save />} disabled={edits[s.id] === undefined || Number(edits[s.id]) === s.capacity} onClick={() => save(s)} aria-label="Save capacity" />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </>
  )
}
