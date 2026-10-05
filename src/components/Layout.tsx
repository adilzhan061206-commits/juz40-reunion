import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  BellRing,
  BookOpen,
  CalendarDays,
  CalendarRange,
  CheckCheck,
  FileCheck2,
  Gauge,
  GraduationCap,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Monitor,
  Moon,
  Sparkles,
  Sun,
  Table2,
  Upload,
  UserCog,
  Users,
  Wand2,
} from 'lucide-react'
import { useApp, useTheme, type Theme } from '../context/app'
import { get, post } from '../lib/api'
import { initials, timeAgo } from '../lib/format'
import { useInterval } from '../lib/hooks'
import type { NotificationT } from '../lib/types'

interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

const NAV: Record<string, { label: string; items: NavItem[] }[]> = {
  student: [
    {
      label: 'Registration',
      items: [
        { to: '/', label: 'Home', icon: <LayoutDashboard />, end: true },
        { to: '/my-courses', label: '1 · My courses', icon: <ListChecks /> },
        { to: '/generator', label: '2 · Build schedule', icon: <Wand2 /> },
        { to: '/schedule', label: '3 · Register & confirm', icon: <CalendarDays /> },
      ],
    },
    {
      label: 'More',
      items: [
        { to: '/registration', label: 'Course catalogue', icon: <BookOpen /> },
        { to: '/degree', label: 'Degree progress', icon: <GraduationCap /> },
        { to: '/recommendations', label: 'Recommendations', icon: <Sparkles /> },
        { to: '/planner', label: 'Future semesters', icon: <CalendarRange /> },
        { to: '/waitlists', label: 'Waitlists & alerts', icon: <BellRing /> },
        { to: '/requests', label: 'Advisor requests', icon: <FileCheck2 /> },
      ],
    },
    { label: 'Account', items: [{ to: '/profile', label: 'Profile & SDU sync', icon: <UserCog /> }] },
  ],
  advisor: [
    {
      label: 'Advising',
      items: [
        { to: '/advisor', label: 'Approval queue', icon: <Inbox />, end: true },
        { to: '/advisor/students', label: 'My students', icon: <Users /> },
      ],
    },
    { label: 'Account', items: [{ to: '/profile', label: 'Profile', icon: <UserCog /> }] },
  ],
  admin: [
    {
      label: 'Registrar',
      items: [
        { to: '/admin', label: 'Overview', icon: <Gauge />, end: true },
        { to: '/admin/import', label: 'Import from SDU', icon: <Upload /> },
        { to: '/admin/sections', label: 'Sections & seats', icon: <Table2 /> },
        { to: '/admin/users', label: 'Users & holds', icon: <Users /> },
      ],
    },
    { label: 'Account', items: [{ to: '/profile', label: 'Profile', icon: <UserCog /> }] },
  ],
}

const TITLES: Record<string, string> = {
  '/': 'Home',
  '/my-courses': 'My courses',
  '/recommendations': 'Recommendations',
  '/generator': 'Build schedule',
  '/degree': 'Degree progress',
  '/planner': 'Future semesters',
  '/registration': 'Course catalogue',
  '/schedule': 'Register & confirm',
  '/waitlists': 'Waitlists & Alerts',
  '/requests': 'Advisor Requests',
  '/profile': 'Profile',
  '/notifications': 'Notifications',
  '/advisor': 'Approval queue',
  '/advisor/students': 'My students',
  '/admin': 'Overview',
  '/admin/import': 'Import from SDU',
  '/admin/sections': 'Sections & seats',
  '/admin/users': 'Users & holds',
}

function ThemeButton() {
  const [theme, setTheme] = useTheme()
  const next: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' }
  const icon = theme === 'dark' ? <Moon /> : theme === 'light' ? <Sun /> : <Monitor />
  return (
    <button className="icon-btn" onClick={() => setTheme(next[theme])} title={`Theme: ${theme}`} aria-label="Change theme">
      {icon}
    </button>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<NotificationT[]>([])
  const [unread, setUnread] = useState(0)
  const lastSeen = useRef<number>(0)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const load = async () => {
    try {
      const data = await get<{ notifications: NotificationT[]; unread: number }>('/api/notifications')
      const newest = data.notifications[0]?.id ?? 0
      if (lastSeen.current && newest > lastSeen.current && 'Notification' in window && Notification.permission === 'granted') {
        data.notifications
          .filter((n) => n.id > lastSeen.current && !n.read)
          .slice(0, 3)
          .forEach((n) => new Notification(n.title, { body: n.body.slice(0, 160), tag: `keste-${n.id}` }))
      }
      lastSeen.current = Math.max(lastSeen.current, newest)
      setItems(data.notifications)
      setUnread(data.unread)
    } catch {
      /* ignore polling errors */
    }
  }

  useEffect(() => {
    // Initial fetch; state is set when the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [])
  useInterval(load, 15000)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const openItem = async (n: NotificationT) => {
    setOpen(false)
    if (!n.read) {
      await post('/api/notifications/read', { ids: [n.id] }).catch(() => {})
      void load()
    }
    if (n.link) navigate(n.link)
  }

  const markAll = async () => {
    await post('/api/notifications/read', { all: true }).catch(() => {})
    void load()
  }

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen((v) => !v)} aria-label="Notifications">
        <Bell />
        {unread > 0 && <span className="dot">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="popover">
          <div className="popover-head">
            <h3>Notifications</h3>
            <div className="row">
              {unread > 0 && (
                <button className="btn ghost sm" onClick={markAll}>
                  <CheckCheck /> Mark all read
                </button>
              )}
            </div>
          </div>
          {items.length === 0 ? (
            <div className="empty" style={{ padding: 32 }}>
              <div className="empty-art">
                <Bell />
              </div>
              <h3>You're all caught up</h3>
              <p>Seat alerts, waitlist updates and advisor decisions will appear here.</p>
            </div>
          ) : (
            items.slice(0, 20).map((n) => (
              <button key={n.id} className={`notif ${n.read ? '' : 'unread'}`} onClick={() => openItem(n)}>
                <span className="n-icon">
                  <NotifIcon kind={n.kind} />
                </span>
                <span>
                  <b>{n.title}</b>
                  <p>{n.body}</p>
                  <time>{timeAgo(n.created_at)}</time>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}

export function NotifIcon({ kind }: { kind: string }) {
  if (kind === 'seat_alert') return <BellRing />
  if (kind === 'enrolled') return <CheckCheck />
  if (kind === 'request') return <FileCheck2 />
  if (kind === 'waitlist') return <Users />
  return <Sparkles />
}

export default function Layout() {
  const { user, logout, meta, termId, setTermId, term } = useApp()
  const location = useLocation()
  const navigate = useNavigate()
  // The mobile menu is open only for the page it was opened on, so navigating closes it.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === location.pathname
  const setOpen = (value: boolean) => setOpenAt(value ? location.pathname : null)
  const groups = NAV[user?.role ?? 'student']

  const title = useMemo(() => {
    const path = location.pathname
    if (TITLES[path]) return TITLES[path]
    if (path.startsWith('/advisor/students/')) return 'Student profile'
    return ''
  }, [location.pathname])

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div>
            <div className="brand-name">Keste</div>
            <div className="brand-sub">Course registration · SDU</div>
          </div>
        </div>

        {meta && (user?.role === 'student' || user?.role === 'admin') && (
          <div className="term-switch">
            <div className="eyebrow">Academic term</div>
            <select value={termId ?? ''} onChange={(e) => setTermId(Number(e.target.value))} aria-label="Academic term">
              {meta.terms.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {term && (
              <div className="term-flags">
                {term.is_current && <span className="badge dark">Current</span>}
                {term.registration_open ? (
                  <span className="badge success">
                    <span className="pulse" style={{ background: 'var(--success)' }} /> Registration open
                  </span>
                ) : (
                  <span className="badge outline">Registration closed</span>
                )}
              </div>
            )}
          </div>
        )}

        <nav className="nav">
          {groups.map((group) => (
            <div key={group.label} style={{ display: 'contents' }}>
              <div className="nav-label">{group.label}</div>
              {group.items.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  {item.icon}
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          {user && (
            <div className="user-chip">
              <div className="avatar">{initials(user.name)}</div>
              <div className="who">
                <b>{user.name}</b>
                <span>
                  {user.role === 'student'
                    ? user.sdu_id
                      ? `SDU ${user.sdu_id}`
                      : 'Student'
                    : user.role === 'advisor'
                      ? `Advisor · ${user.department?.code ?? ''}`
                      : 'Registrar'}
                </span>
              </div>
              <button
                className="btn ghost sm icon"
                title="Sign out"
                aria-label="Sign out"
                onClick={async () => {
                  await logout()
                  navigate('/login')
                }}
              >
                <LogOut />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <button className="icon-btn mobile-only" onClick={() => setOpen(true)} aria-label="Open menu">
            <Menu />
          </button>
          <div className="crumb">
            <span className="hide-sm">Keste</span>
            <span className="hide-sm">/</span>
            <b>{title}</b>
          </div>
          <div className="spacer" />
          <ThemeButton />
          <NotificationBell />
        </header>
        <main className="content" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
