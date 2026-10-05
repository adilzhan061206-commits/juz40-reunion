import { useEffect, useState } from 'react'
import { DAYS, hhmm, kindLabel, courseColor } from '../lib/format'

import type { GridItem } from '../lib/grid'

interface Props {
  items: GridItem[]
  variant?: 'board' | 'paper'
  compact?: boolean
  daysOff?: number[]
  showNow?: boolean
  emptyText?: string
  onSelect?: (item: GridItem) => void
}

function useNow(enabled: boolean) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(id)
  }, [enabled])
  return now
}

export default function WeekGrid({
  items,
  variant = 'board',
  compact,
  daysOff = [],
  showNow = false,
  emptyText = 'No classes yet',
  onSelect,
}: Props) {
  const now = useNow(showNow)
  const meetings = items.flatMap((i) => i.meetings)
  const hasSaturday = meetings.some((m) => m.day === 5)
  const days = hasSaturday ? 6 : 5
  const startHour = Math.min(8, ...meetings.map((m) => Math.floor(m.start / 60)))
  const endHour = Math.max(18, ...meetings.map((m) => Math.ceil(m.end / 60)))
  const hours = endHour - startHour
  const hourPx = compact ? 44 : 58
  const today = (now.getDay() + 6) % 7
  const nowMin = now.getHours() * 60 + now.getMinutes()

  return (
    <div className={`week ${variant === 'paper' ? 'paper' : ''} ${compact ? 'compact' : ''}`}
         style={{ ['--days' as string]: days }}>
      <div className="week-head">
        <div />
        {DAYS.slice(0, days).map((d, i) => (
          <div key={d} className={showNow && i === today ? 'today' : ''}>
            {d}
          </div>
        ))}
      </div>
      <div className="week-body" style={{ height: hours * hourPx }}>
        <div className="week-times">
          {Array.from({ length: hours }, (_, i) => (
            <span key={i} style={{ top: i * hourPx + (i === 0 ? 10 : 0) }}>
              {String(startHour + i).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {Array.from({ length: days }, (_, day) => (
          <div key={day} className={`week-col ${showNow && day === today ? 'today' : ''} ${daysOff.includes(day) ? 'off' : ''}`}>
            {showNow && day === today && nowMin > startHour * 60 && nowMin < endHour * 60 && (
              <div className="now-line" style={{ top: ((nowMin - startHour * 60) / 60) * hourPx }} />
            )}
            {items.flatMap((item) =>
              item.meetings
                .filter((m) => m.day === day)
                .map((m, idx) => {
                  const top = ((m.start - startHour * 60) / 60) * hourPx
                  const height = Math.max(22, ((m.end - m.start) / 60) * hourPx - 3)
                  const classes = [
                    'block',
                    item.draft && 'draft',
                    item.conflict && 'conflict',
                    item.highlight && 'highlight',
                    item.dim && 'dim',
                    height < 46 && 'small',
                  ]
                    .filter(Boolean)
                    .join(' ')
                  return (
                    <div
                      key={`${item.key}-${idx}`}
                      className={classes}
                      style={{ top, height, ['--c' as string]: item.color ?? courseColor(item.code), cursor: onSelect ? 'pointer' : undefined }}
                      title={`${item.code} ${item.title}\n${kindLabel(item.kind)} ${item.section} · ${hhmm(m.start)}–${hhmm(m.end)}${m.room ? ` · ${m.room}` : ''}${item.instructor ? `\n${item.instructor}` : ''}`}
                      onClick={onSelect ? () => onSelect(item) : undefined}
                    >
                      <b>
                        {item.code} · {item.section}
                      </b>
                      <span className="t">{item.title}</span>
                      <span className="m">
                        {hhmm(m.start)}–{hhmm(m.end)}
                        {m.room ? ` · ${m.room}` : ''}
                      </span>
                    </div>
                  )
                }),
            )}
          </div>
        ))}
        {items.length === 0 && <div className="week-empty">{emptyText}</div>}
      </div>
    </div>
  )
}
