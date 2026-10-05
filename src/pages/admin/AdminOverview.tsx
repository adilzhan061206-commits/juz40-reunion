import { Link } from 'react-router-dom'
import { BookOpen, CalendarCog, FileCheck2, Hourglass, Link2, Table2, Upload, Users } from 'lucide-react'
import { Badge, Button, Card, CardHead, ErrorState, LoadingCards, PageHead, Stat } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { errorText, get, patch } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import type { Term } from '../../lib/types'

interface Overview {
  users: number
  students: number
  advisors: number
  sdu_linked: number
  courses: number
  sections: number
  enrollments: number
  waitlisted: number
  pending_requests: number
  terms: Term[]
}

export default function AdminOverview() {
  const toast = useToast()
  const { reloadMeta } = useApp()
  const { data, error, loading, reload } = useAsync(() => get<Overview>('/api/admin/overview'), [])
  if (error) return <ErrorState message={error} onRetry={reload} />
  if (loading && !data) return <LoadingCards count={2} height={140} />
  if (!data) return null

  const update = async (term: Term, body: Partial<Term>) => {
    try {
      await patch(`/api/admin/terms/${term.id}`, body)
      await Promise.all([reload(), reloadMeta()])
      toast('success', `${term.name} updated`)
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <PageHead
        eyebrow="Registrar office"
        title="Overview"
        lead="Manage terms and registration windows, import the official timetable from my.sdu.edu.kz, and watch seat demand."
        actions={<Link to="/admin/import"><Button variant="accent" icon={<Upload />}>Import timetable</Button></Link>}
      />
      <div className="stack lg">
        <div className="grid cols-4">
          <Stat label="Students" icon={<Users />} value={data.students} hint={`${data.sdu_linked} linked to my.sdu`} />
          <Stat label="Catalogue" icon={<BookOpen />} value={data.courses} unit="courses" hint={`${data.sections} sections`} />
          <Stat label="Enrollments" icon={<Table2 />} value={data.enrollments} hint={`${data.waitlisted} on waitlists`} />
          <Stat label="Advisor queue" icon={<FileCheck2 />} value={data.pending_requests} hint={`${data.advisors} advisors`} />
        </div>
        <Card>
          <CardHead title="Academic terms" icon={<CalendarCog />} />
          <div className="scroll-x" style={{ marginTop: 8 }}>
            <table className="table">
              <thead>
                <tr><th>Term</th><th>Dates</th><th>Status</th><th style={{ textAlign: 'right' }}>Registration</th></tr>
              </thead>
              <tbody>
                {data.terms.map((t) => (
                  <tr key={t.id}>
                    <td><b>{t.name}</b> <span className="mono faint" style={{ fontSize: 12 }}>{t.code}</span></td>
                    <td className="muted">{t.start_date} → {t.end_date}</td>
                    <td>
                      {t.is_current ? <Badge tone="dark">Current</Badge> : (
                        <Button size="sm" variant="ghost" onClick={() => update(t, { is_current: true })}>Make current</Button>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <label className="checkbox" style={{ justifyContent: 'flex-end' }}>
                        <input type="checkbox" checked={t.registration_open} onChange={(e) => update(t, { registration_open: e.target.checked })} />
                        {t.registration_open ? 'Open' : 'Closed'}
                      </label>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="grid cols-3">
          {[
            { to: '/admin/import', icon: <Link2 />, title: 'Sync the timetable', text: 'Paste a schedule grid saved from my.sdu.edu.kz to load every section into the catalogue.' },
            { to: '/admin/sections', icon: <Hourglass />, title: 'Open seats', text: 'Raise a section capacity — waitlisted students are enrolled automatically, in order.' },
            { to: '/admin/users', icon: <Users />, title: 'Roles & holds', text: 'Promote advisors, assign departments and lift financial holds.' },
          ].map((c) => (
            <Link key={c.to} to={c.to} className="card pad interactive">
              <div className="row" style={{ color: 'var(--accent-strong)' }}>{c.icon}<h3>{c.title}</h3></div>
              <p className="muted" style={{ fontSize: 13, marginTop: 8 }}>{c.text}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
