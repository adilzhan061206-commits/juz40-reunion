export type Role = 'student' | 'advisor' | 'admin'

export interface User {
  id: number
  name: string
  email: string | null
  role: Role
  sdu_id: string | null
  department: { id: number; code: string; name: string } | null
  program: { id: number; name: string; personal: boolean } | null
  financial_hold: boolean
  last_sdu_sync: number | null
  has_password: boolean
}

export interface Term {
  id: number
  code: string
  name: string
  start_date: string
  end_date: string
  is_current: boolean
  registration_open: boolean
}

export interface Meta {
  terms: Term[]
  default_term_id: number | null
  departments: { id: number; code: string; name: string }[]
  programs: { id: number; code: string; name: string; department_id: number | null }[]
  config: { max_ects: number; max_seat_alerts: number; sdu_login: boolean; sdu_url: string }
}

export interface MeetingT {
  day: number
  start: number
  end: number
  room: string | null
}

export interface CourseRef {
  id: number
  code: string
  title: string
  ects: number
  credits: number
}

export interface SectionT {
  id: number
  code: string
  kind: 'lecture' | 'practice' | 'lab'
  instructor: string | null
  capacity: number
  enrolled: number
  seats_left: number
  waitlist: number
  term_id: number
  source: string
  meetings: MeetingT[]
  course: CourseRef
}

export interface PrereqCheck {
  status: 'met' | 'provisional' | 'missing' | 'waived' | 'none'
  blocked: boolean
  message: string
  missing: string[]
  provisional: string[]
  corequisites: string[]
  missing_corequisites: string[]
}

export interface CatalogSection extends Omit<SectionT, 'course'> {
  in_cart: boolean
  enrolled_here: boolean
  waitlisted: boolean
  waitlist_position: number | null
  alert: boolean
  conflicts_with: string[]
}

export interface CatalogCourse {
  id: number
  code: string
  title: string
  credits: number
  ects: number
  hours: string | null
  description: string | null
  department: string | null
  source: string
  prerequisites: { code: string; title: string; kind: 'pre' | 'co' }[]
  prerequisite_check: PrereqCheck | null
  completed: boolean
  in_progress: boolean
  sections: CatalogSection[]
}

export interface ConflictT {
  section_ids: number[]
  message: string
  suggestions: { replace_id: number; replace_label: string; in_cart: boolean; section: SectionT }[]
}

export interface ScheduleState {
  term: Term
  enrolled: SectionT[]
  cart: (SectionT & { prerequisite: PrereqCheck })[]
  conflicts: ConflictT[]
  ects: { enrolled: number; with_cart: number; limit: number }
  confirmed_at: number | null
  financial_hold: boolean
}

export interface AuditItem {
  course_id: number
  code: string
  title: string
  ects: number
  credits: number
  semester: number | null
  status: 'completed' | 'in_progress' | 'missing'
  grade: string | null
  offered: boolean
  has_open_seat: boolean
}

export interface AuditGroup {
  id: number
  name: string
  category: string
  category_label: string
  kind: 'required' | 'elective'
  required_ects: number
  completed_ects: number
  in_progress_ects: number
  missing_ects: number
  satisfied: boolean
  items: AuditItem[]
  missing_courses: AuditItem[]
}

export interface Audit {
  program: { id: number; code: string; name: string; total_ects: number; personal: boolean } | null
  groups: AuditGroup[]
  totals: { required: number; completed: number; in_progress: number; missing: number; percent: number }
  warnings: string[]
  other_completed: { code: string; title: string; ects: number; grade: string | null }[]
  upcoming_term?: { id: number; name: string } | null
}

export interface Recommendation {
  course_id: number
  code: string
  title: string
  ects: number
  fulfills: string
  category: string
  semester: number | null
  has_open_seat: boolean
  in_cart: boolean
  prerequisite: PrereqCheck
  score?: number
  match?: number
  reasons?: string[]
}

export interface OverrideRequestT {
  id: number
  kind: 'credit_overload' | 'prerequisite_waiver'
  status: 'pending' | 'approved' | 'rejected'
  reason: string
  feedback: string | null
  requested_ects: number | null
  course: { id: number; code: string; title: string } | null
  term: { id: number; name: string }
  student: {
    id: number
    name: string
    sdu_id: string | null
    email: string | null
    department: string | null
    program: string | null
  }
  advisor: { id: number; name: string } | null
  created_at: number
  decided_at: number | null
  current_ects?: number
  prerequisite?: PrereqCheck
}

export interface NotificationT {
  id: number
  kind: string
  title: string
  body: string
  link: string | null
  read: boolean
  created_at: number
}

export interface WaitlistEntryT {
  id: number
  status: 'waiting' | 'held' | 'enrolled' | 'skipped' | 'cancelled' | 'expired'
  note: string | null
  position: number | null
  hold_deadline: number | null
  created_at: number
  section: SectionT
}

export interface AlertT {
  id: number
  channels: string[]
  created_at: number
  last_notified_at: number | null
  section: SectionT
}

export interface PlanT {
  id: number
  name: string
  notes: string
  term: Term
  items: {
    course: { id: number; code: string; title: string; ects: number }
    sections: SectionT[]
    missing_prerequisites: string[]
    offered: boolean
    completed: boolean
  }[]
  ects: number
  conflicts: number[][]
  created_at: number
  updated_at: number
}

export interface SyncSummary {
  term: string | null
  courses: number
  sections: number
  enrollments: number
  transcript: number
  warnings: string[]
}
