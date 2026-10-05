/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CheckCircle2, Info, XCircle } from 'lucide-react'
import { get, post, setUnauthorizedHandler } from '../lib/api'
import type { Meta, Term, User } from '../lib/types'

// ------------------------------------------------------------------ toasts

type ToastKind = 'success' | 'error' | 'info'
interface Toast {
  id: number
  kind: ToastKind
  title: string
  body?: string
}

interface ToastApi {
  toast: (kind: ToastKind, title: string, body?: string) => void
}

const ToastContext = createContext<ToastApi>({ toast: () => {} })

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const counter = useRef(0)
  const toast = useCallback((kind: ToastKind, title: string, body?: string) => {
    const id = ++counter.current
    setToasts((list) => [...list.slice(-3), { id, kind, title, body }])
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === 'error' ? 6500 : 4200)
  }, [])
  const value = useMemo(() => ({ toast }), [toast])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind}`}>
            {t.kind === 'success' ? <CheckCircle2 /> : t.kind === 'error' ? <XCircle /> : <Info />}
            <div>
              <b>{t.title}</b>
              {t.body && <span>{t.body}</span>}
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext).toast

// ------------------------------------------------------------------ session, metadata and term

interface AppApi {
  user: User | null
  meta: Meta | null
  ready: boolean
  setUser: (user: User | null) => void
  refreshUser: () => Promise<void>
  logout: () => Promise<void>
  termId: number | null
  term: Term | null
  setTermId: (id: number) => void
  reloadMeta: () => Promise<void>
}

const AppContext = createContext<AppApi | null>(null)

export function AppProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [meta, setMeta] = useState<Meta | null>(null)
  const [ready, setReady] = useState(false)
  const [termId, setTermIdState] = useState<number | null>(() => {
    const stored = Number(localStorage.getItem('keste-term'))
    return Number.isFinite(stored) && stored > 0 ? stored : null
  })

  const reloadMeta = useCallback(async () => {
    const data = await get<Meta>('/api/meta')
    setMeta(data)
    setTermIdState((current) =>
      current && data.terms.some((t) => t.id === current) ? current : data.default_term_id,
    )
  }, [])

  const refreshUser = useCallback(async () => {
    try {
      const data = await get<{ user: User }>('/api/auth/me')
      setUser(data.user)
    } catch {
      setUser(null)
    }
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null))
    // Bootstrap fetch: state is only set once the requests settle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    Promise.allSettled([reloadMeta(), refreshUser()]).finally(() => setReady(true))
  }, [reloadMeta, refreshUser])

  const logout = useCallback(async () => {
    try {
      await post('/api/auth/logout')
    } finally {
      setUser(null)
    }
  }, [])

  const setTermId = useCallback((id: number) => {
    setTermIdState(id)
    try {
      localStorage.setItem('keste-term', String(id))
    } catch {
      /* ignore */
    }
  }, [])

  const term = meta?.terms.find((t) => t.id === termId) ?? null
  const value = useMemo(
    () => ({ user, meta, ready, setUser, refreshUser, logout, termId, term, setTermId, reloadMeta }),
    [user, meta, ready, refreshUser, logout, termId, term, setTermId, reloadMeta],
  )
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>
}

export function useApp(): AppApi {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used inside AppProvider')
  return ctx
}

// ------------------------------------------------------------------ theme

export type Theme = 'light' | 'dark' | 'system'

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = localStorage.getItem('keste-theme')
    return stored === 'light' || stored === 'dark' ? stored : 'system'
  })
  const apply = useCallback((next: Theme) => {
    setTheme(next)
    try {
      if (next === 'system') {
        localStorage.removeItem('keste-theme')
        delete document.documentElement.dataset.theme
      } else {
        localStorage.setItem('keste-theme', next)
        document.documentElement.dataset.theme = next
      }
    } catch {
      /* ignore */
    }
  }, [])
  return [theme, apply]
}

export function isDark(): boolean {
  const forced = document.documentElement.dataset.theme
  if (forced) return forced === 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}
