import { useState } from 'react'
import { Search } from 'lucide-react'
import { Badge, Card, ErrorState, LoadingCards, PageHead, Segmented } from '../../components/ui'
import { useApp, useToast } from '../../context/app'
import { errorText, get, patch } from '../../lib/api'
import { initials } from '../../lib/format'
import { useAsync, useDebounced } from '../../lib/hooks'
import type { Role, User } from '../../lib/types'

export default function AdminUsers() {
  const { meta, user: me } = useApp()
  const toast = useToast()
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<'' | Role>('')
  const q = useDebounced(query, 220)
  const { data, error, loading, reload } = useAsync(
    () => get<{ users: User[] }>(`/api/admin/users?q=${encodeURIComponent(q)}&role=${role}`),
    [q, role],
  )
  if (error) return <ErrorState message={error} onRetry={reload} />

  const update = async (u: User, body: Record<string, unknown>, message: string) => {
    try {
      const result = await patch<{ waitlist_events: { result: string }[] }>(`/api/admin/users/${u.id}`, body)
      const enrolled = result.waitlist_events.filter((e) => e.result === 'enrolled').length
      toast('success', message, enrolled ? `${enrolled} waitlist seat(s) granted after the hold was lifted` : undefined)
      void reload()
    } catch (e) {
      toast('error', errorText(e))
    }
  }

  return (
    <>
      <PageHead title="Users & holds" lead="Assign advisors to departments (advisors only see their own department's students) and manage financial holds." />
      <Card pad>
        <div className="row wrap" style={{ gap: 12 }}>
          <div className="input-icon grow" style={{ minWidth: 220 }}>
            <Search />
            <input className="input" placeholder="Search name, e-mail or SDU ID" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Segmented
            value={role}
            onChange={setRole}
            options={[{ value: '', label: 'All' }, { value: 'student', label: 'Students' }, { value: 'advisor', label: 'Advisors' }, { value: 'admin', label: 'Admins' }]}
          />
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
                  <tr><th>User</th><th>Role</th><th>Department</th><th>Financial hold</th></tr>
                </thead>
                <tbody>
                  {data?.users.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <div className="row" style={{ gap: 10 }}>
                          <div className="avatar" style={{ width: 32, height: 32, fontSize: 12 }}>{initials(u.name)}</div>
                          <div>
                            <b style={{ fontSize: 13.5 }}>{u.name}</b>
                            <div className="muted" style={{ fontSize: 12 }}>{[u.email, u.sdu_id && `SDU ${u.sdu_id}`].filter(Boolean).join(' · ') || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td>
                        <select className="select" style={{ height: 34, width: 120 }} value={u.role} disabled={u.id === me?.id} onChange={(e) => update(u, { role: e.target.value }, `${u.name} is now ${e.target.value}`)}>
                          <option value="student">Student</option>
                          <option value="advisor">Advisor</option>
                          <option value="admin">Admin</option>
                        </select>
                      </td>
                      <td>
                        <select className="select" style={{ height: 34, width: 220 }} value={u.department?.id ?? ''} onChange={(e) => update(u, { department_id: Number(e.target.value) }, 'Department updated')}>
                          <option value="" disabled>—</option>
                          {meta?.departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                      </td>
                      <td>
                        {u.role === 'student' ? (
                          <label className="checkbox">
                            <input type="checkbox" checked={u.financial_hold} onChange={(e) => update(u, { financial_hold: e.target.checked }, e.target.checked ? 'Hold placed' : 'Hold lifted')} />
                            {u.financial_hold ? <Badge tone="danger">Hold</Badge> : <span className="muted">None</span>}
                          </label>
                        ) : (
                          <span className="faint">—</span>
                        )}
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
