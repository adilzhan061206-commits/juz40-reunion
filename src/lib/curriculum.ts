import { get } from './api'
import { useAsync } from './hooks'
import type { PrereqCheck } from './types'

export interface PickCourse {
  id: number
  code: string
  title: string
  ects: number
}

export interface CurriculumItem {
  course_id: number
  code: string
  title: string
  ects: number
  semester: number | null
  offered: boolean
  open_seats: number
  prerequisite: PrereqCheck
  registered: boolean
  suggested?: boolean
}

export interface CurriculumData {
  season: 'fall' | 'spring' | null
  allowed_semesters: number[]
  program: { name: string } | null
  completed: { course_id: number }[]
  in_progress: { course_id: number }[]
  next: CurriculumItem[]
  electives: { group: string; semester: number | null; options: CurriculumItem[] }[]
}

export function useCurriculum(termId: number | null | undefined) {
  return useAsync(() => get<CurriculumData>(`/api/my-courses?term_id=${termId ?? ''}`), [termId])
}

