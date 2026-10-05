import type { ReactNode } from 'react'
import { CalendarCheck, GraduationCap, ShieldCheck, Wand2 } from 'lucide-react'

const TILES = [
  'c1', '', 'c2 tall', '', 'c3',
  '', 'c4', '', 'c1', '',
  'c3', '', '', 'c2', 'c4 tall',
  '', 'c1', 'c3', '', '',
  'c2', '', 'c4', 'c1', '',
]

export default function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <section className="auth-art">
        <div className="brand" style={{ padding: 0 }}>
          <div className="brand-mark" aria-hidden>
            <i />
            <i />
            <i />
            <i />
          </div>
          <div>
            <div className="brand-name">Keste</div>
            <div className="brand-sub">Intelligent course registration for SDU</div>
          </div>
        </div>

        <div className="mosaic" aria-hidden>
          {TILES.map((t, i) => (
            <i key={i} className={t} style={{ animationDelay: `${i * 30}ms` }} />
          ))}
        </div>

        <div style={{ position: 'relative', zIndex: 1 }}>
          <h1>
            Your semester, <em>sorted</em> ✨ before the rush.
          </h1>
          <p className="lead">
            Sign in with your my.sdu.edu.kz account — your courses, grades and timetable are pulled in automatically.
            Then build a conflict-free schedule and register in one click.
          </p>
        </div>

        <div className="auth-points">
          <div>
            <Wand2 />
            <span>Conflict-free schedules generated from your preferred time slots and days off.</span>
          </div>
          <div>
            <GraduationCap />
            <span>Degree audit that shows exactly which requirements are left until graduation.</span>
          </div>
          <div>
            <CalendarCheck />
            <span>Waitlist auto-enrolment, seat alerts and one-click export to your calendar.</span>
          </div>
          <div>
            <ShieldCheck />
            <span>Your SDU password is used once to fetch your data and is never stored.</span>
          </div>
        </div>
      </section>
      <section className="auth-form-wrap">{children}</section>
    </div>
  )
}
