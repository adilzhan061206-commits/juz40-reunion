import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck } from 'lucide-react'
import { Button, Card, Empty, ErrorState, LoadingCards, PageHead } from '../../components/ui'
import { NotifIcon } from '../../components/Layout'
import { get, post } from '../../lib/api'
import { dateText } from '../../lib/format'
import { useAsync } from '../../lib/hooks'
import type { NotificationT } from '../../lib/types'

export default function Notifications() {
  const navigate = useNavigate()
  const { data, error, loading, reload } = useAsync(() => get<{ notifications: NotificationT[]; unread: number }>('/api/notifications'), [])
  if (error) return <ErrorState message={error} onRetry={reload} />
  return (
    <>
      <PageHead
        title="Notifications"
        actions={
          <Button icon={<CheckCheck />} onClick={async () => { await post('/api/notifications/read', { all: true }); void reload() }}>
            Mark all read
          </Button>
        }
      />
      {loading && !data ? (
        <LoadingCards count={4} height={70} />
      ) : !data?.notifications.length ? (
        <Card><Empty icon={<Bell />} title="No notifications yet" /></Card>
      ) : (
        <Card>
          {data.notifications.map((n) => (
            <button
              key={n.id}
              className={`notif ${n.read ? '' : 'unread'}`}
              onClick={async () => {
                if (!n.read) await post('/api/notifications/read', { ids: [n.id] })
                if (n.link) navigate(n.link)
                else void reload()
              }}
            >
              <span className="n-icon"><NotifIcon kind={n.kind} /></span>
              <span>
                <b>{n.title}</b>
                <p style={{ WebkitLineClamp: 'unset' }}>{n.body}</p>
                <time>{dateText(n.created_at)}</time>
              </span>
            </button>
          ))}
        </Card>
      )}
    </>
  )
}
