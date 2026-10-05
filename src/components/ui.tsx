import { useEffect, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { AlertTriangle, CheckCircle2, Info, Lock, ShieldCheck, X, XCircle } from 'lucide-react'
import type { PrereqCheck } from '../lib/types'

type Variant = 'primary' | 'accent' | 'ghost' | 'danger' | 'success' | 'default'

export function Button({
  variant = 'default',
  size,
  loading,
  block,
  icon,
  children,
  className = '',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: 'sm' | 'lg'
  loading?: boolean
  block?: boolean
  icon?: ReactNode
}) {
  const classes = ['btn', variant !== 'default' && variant, size, block && 'full', !children && 'icon', className]
    .filter(Boolean)
    .join(' ')
  return (
    <button className={classes} disabled={loading || rest.disabled} {...rest}>
      {loading ? <span className="spinner" /> : icon}
      {children}
    </button>
  )
}

export function Card({
  children,
  className = '',
  pad = false,
}: {
  children: ReactNode
  className?: string
  pad?: boolean | 'lg'
}) {
  return <div className={`card ${pad === 'lg' ? 'pad-lg' : pad ? 'pad' : ''} ${className}`}>{children}</div>
}

export function CardHead({ title, icon, action }: { title: ReactNode; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card-head">
      <h3>
        {icon}
        {title}
      </h3>
      {action}
    </div>
  )
}

export function Badge({
  tone,
  children,
  icon,
}: {
  tone?: 'success' | 'danger' | 'warning' | 'info' | 'accent' | 'outline' | 'dark'
  children: ReactNode
  icon?: ReactNode
}) {
  return (
    <span className={`badge ${tone ?? ''}`}>
      {icon}
      {children}
    </span>
  )
}

export function PageHead({
  eyebrow,
  title,
  lead,
  actions,
}: {
  eyebrow?: string
  title: ReactNode
  lead?: ReactNode
  actions?: ReactNode
}) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 10 }}>{eyebrow}</div>}
        <h1>{title}</h1>
        {lead && <p className="lead">{lead}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  )
}

export function Empty({
  icon,
  title,
  children,
  action,
}: {
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty">
      <div className="empty-art">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div style={{ marginTop: 8 }}>{action}</div>}
    </div>
  )
}

export function Notice({
  tone = 'info',
  children,
  title,
}: {
  tone?: 'info' | 'warning' | 'danger' | 'success'
  children?: ReactNode
  title?: ReactNode
}) {
  const icon =
    tone === 'success' ? <CheckCircle2 /> : tone === 'danger' ? <XCircle /> : tone === 'warning' ? <AlertTriangle /> : <Info />
  return (
    <div className={`notice ${tone}`}>
      {icon}
      <div>
        {title && <b>{title} </b>}
        {children}
      </div>
    </div>
  )
}

export function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
  wide,
}: {
  title: ReactNode
  subtitle?: ReactNode
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? 'wide' : ''}`} role="dialog" aria-modal="true">
        <div className="modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <X />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  full,
}: {
  options: { value: T; label: ReactNode }[]
  value: T
  onChange: (value: T) => void
  full?: boolean
}) {
  return (
    <div className={`segmented ${full ? 'full' : ''}`} role="tablist">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          className={o.value === value ? 'on' : ''}
          onClick={() => onChange(o.value)}
          role="tab"
          aria-selected={o.value === value}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: { value: T; label: ReactNode; count?: number }[]
  value: T
  onChange: (value: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((t) => (
        <button key={t.value} className={t.value === value ? 'on' : ''} onClick={() => onChange(t.value)} role="tab">
          {t.label}
          {t.count !== undefined && t.count > 0 && <span className="badge accent">{t.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Ring({
  value,
  secondary = 0,
  size = 148,
  stroke = 14,
  label,
  sub,
}: {
  value: number
  secondary?: number
  size?: number
  stroke?: number
  label?: ReactNode
  sub?: ReactNode
}) {
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  const first = Math.max(0, Math.min(100, value))
  const second = Math.max(0, Math.min(100 - first, secondary))
  return (
    <div className="ring-wrap" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeDasharray={`${(c * (first + second)) / 100} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--success)"
          strokeWidth={stroke}
          strokeDasharray={`${(c * first) / 100} ${c}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray .8s cubic-bezier(.2,.8,.2,1)' }}
        />
      </svg>
      <div className="ring-label">
        <b>{label ?? `${Math.round(first)}%`}</b>
        {sub && <span>{sub}</span>}
      </div>
    </div>
  )
}

export function Stat({
  label,
  value,
  unit,
  hint,
  icon,
}: {
  label: string
  value: ReactNode
  unit?: string
  hint?: ReactNode
  icon?: ReactNode
}) {
  return (
    <div className="card stat">
      <div className="label">
        {icon}
        {label}
      </div>
      <div className="value">
        {value}
        {unit && <small>{unit}</small>}
      </div>
      {hint && <div className="hint">{hint}</div>}
    </div>
  )
}

export function Skeleton({ height = 16, width = '100%', style }: { height?: number; width?: number | string; style?: React.CSSProperties }) {
  return <div className="skeleton" style={{ height, width, ...style }} />
}

export function LoadingCards({ count = 3, height = 120 }: { count?: number; height?: number }) {
  return (
    <div className="stack">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} height={height} style={{ borderRadius: 18 }} />
      ))}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Card pad>
      <Empty icon={<AlertTriangle />} title="Couldn't load this page" action={onRetry && <Button onClick={onRetry}>Try again</Button>}>
        {message}
      </Empty>
    </Card>
  )
}

export function Field({ label, help, children }: { label: string; help?: ReactNode; children: ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {help && <span className="help">{help}</span>}
    </label>
  )
}

export function SeatMeter({ left, capacity }: { left: number; capacity: number }) {
  const taken = capacity - left
  const pct = capacity ? Math.min(100, (taken / capacity) * 100) : 100
  const cls = left <= 0 ? 'full' : left <= Math.max(2, capacity * 0.15) ? 'low' : ''
  return (
    <div className={`seat ${cls}`} title={`${taken} of ${capacity} seats taken`}>
      <div className="bar">
        <i style={{ width: `${pct}%` }} />
      </div>
      <span>{left <= 0 ? 'Full' : `${left} left`}</span>
    </div>
  )
}

export function PrereqBadge({ check }: { check: PrereqCheck | null | undefined }) {
  if (!check || check.status === 'none') return null
  if (check.blocked)
    return (
      <Badge tone="danger" icon={<Lock />}>
        {check.message}
      </Badge>
    )
  if (check.status === 'waived')
    return (
      <Badge tone="info" icon={<ShieldCheck />}>
        Waived by advisor
      </Badge>
    )
  if (check.status === 'provisional')
    return (
      <Badge tone="warning" icon={<CheckCircle2 />}>
        Provisional · {check.provisional.join(', ')} in progress
      </Badge>
    )
  return (
    <Badge tone="success" icon={<CheckCircle2 />}>
      Prerequisites met
    </Badge>
  )
}

export function StackedBar({
  done,
  wip,
  missing,
  total,
  className = 'stacked',
}: {
  done: number
  wip: number
  missing: number
  total: number
  className?: string
}) {
  const t = total || 1
  return (
    <div className={className}>
      <i className="done" style={{ width: `${(done / t) * 100}%` }} />
      <i className="wip" style={{ width: `${(wip / t) * 100}%` }} />
      <i className="miss" style={{ width: `${(missing / t) * 100}%` }} />
    </div>
  )
}
