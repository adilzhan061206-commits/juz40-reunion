import type { MeetingT } from './types'

export interface GridItem {
  key: string | number
  code: string
  title: string
  kind: string
  section: string
  instructor?: string | null
  meetings: MeetingT[]
  draft?: boolean
  conflict?: boolean
  highlight?: boolean
  dim?: boolean
  color?: string
}

export function toGridItems(
  sections: { id: number; code: string; kind: string; instructor: string | null; meetings: MeetingT[]; course: { code: string; title: string } }[],
  extra: Partial<GridItem> = {},
): GridItem[] {
  return sections.map((s) => ({
    key: s.id,
    code: s.course.code,
    title: s.course.title,
    kind: s.kind,
    section: s.code,
    instructor: s.instructor,
    meetings: s.meetings,
    ...extra,
  }))
}
