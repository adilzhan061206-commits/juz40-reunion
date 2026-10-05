import { lazy, Suspense, type ReactNode } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout'
import { useApp } from './context/app'
import Login from './pages/auth/Login'
import Register from './pages/auth/Register'
import { ForgotPassword, ResetPassword } from './pages/auth/Recover'
import type { Role } from './lib/types'

const Dashboard = lazy(() => import('./pages/student/Dashboard'))
const MyCourses = lazy(() => import('./pages/student/MyCourses'))
const Registration = lazy(() => import('./pages/student/Registration'))
const Schedule = lazy(() => import('./pages/student/Schedule'))
const Generator = lazy(() => import('./pages/student/Generator'))
const Degree = lazy(() => import('./pages/student/Degree'))
const Recommendations = lazy(() => import('./pages/student/Recommendations'))
const Planner = lazy(() => import('./pages/student/Planner'))
const Requests = lazy(() => import('./pages/student/Requests'))
const Waitlists = lazy(() => import('./pages/student/Waitlists'))
const Profile = lazy(() => import('./pages/student/Profile'))
const Notifications = lazy(() => import('./pages/student/Notifications'))
const AdvisorQueue = lazy(() => import('./pages/advisor/AdvisorQueue'))
const AdvisorStudents = lazy(() => import('./pages/advisor/AdvisorStudents'))
const StudentDetail = lazy(() => import('./pages/advisor/StudentDetail'))
const AdminOverview = lazy(() => import('./pages/admin/AdminOverview'))
const AdminImport = lazy(() => import('./pages/admin/AdminImport'))
const AdminSections = lazy(() => import('./pages/admin/AdminSections'))
const AdminUsers = lazy(() => import('./pages/admin/AdminUsers'))

function Splash() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
      <div className="brand-mark" style={{ width: 44, height: 44, animation: 'pulse-ring 1.4s infinite', borderRadius: 13 }}>
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

function RequireAuth({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, ready } = useApp()
  if (!ready) return <Splash />
  if (!user) return <Navigate to="/login" replace />
  if (roles && !roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

function GuestOnly({ children }: { children: ReactNode }) {
  const { user, ready } = useApp()
  if (!ready) return <Splash />
  if (user) return <Navigate to={homeFor(user.role)} replace />
  return <>{children}</>
}

function homeFor(role: Role) {
  return role === 'advisor' ? '/advisor' : role === 'admin' ? '/admin' : '/'
}

function Home() {
  const { user } = useApp()
  if (user && user.role !== 'student') return <Navigate to={homeFor(user.role)} replace />
  return <Dashboard />
}

const page = (node: ReactNode) => <Suspense fallback={<div className="skeleton" style={{ height: 320, borderRadius: 18 }} />}>{node}</Suspense>

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<GuestOnly><Login /></GuestOnly>} />
        <Route path="/register" element={<GuestOnly><Register /></GuestOnly>} />
        <Route path="/forgot-password" element={<GuestOnly><ForgotPassword /></GuestOnly>} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route element={<RequireAuth><Layout /></RequireAuth>}>
          <Route index element={page(<Home />)} />
          <Route path="my-courses" element={<RequireAuth roles={['student']}>{page(<MyCourses />)}</RequireAuth>} />
          <Route path="registration" element={<RequireAuth roles={['student']}>{page(<Registration />)}</RequireAuth>} />
          <Route path="schedule" element={<RequireAuth roles={['student']}>{page(<Schedule />)}</RequireAuth>} />
          <Route path="generator" element={<RequireAuth roles={['student']}>{page(<Generator />)}</RequireAuth>} />
          <Route path="degree" element={<RequireAuth roles={['student']}>{page(<Degree />)}</RequireAuth>} />
          <Route path="recommendations" element={<RequireAuth roles={['student']}>{page(<Recommendations />)}</RequireAuth>} />
          <Route path="planner" element={<RequireAuth roles={['student']}>{page(<Planner />)}</RequireAuth>} />
          <Route path="requests" element={<RequireAuth roles={['student']}>{page(<Requests />)}</RequireAuth>} />
          <Route path="waitlists" element={<RequireAuth roles={['student']}>{page(<Waitlists />)}</RequireAuth>} />
          <Route path="notifications" element={page(<Notifications />)} />
          <Route path="profile" element={page(<Profile />)} />
          <Route path="advisor" element={<RequireAuth roles={['advisor']}>{page(<AdvisorQueue />)}</RequireAuth>} />
          <Route path="advisor/students" element={<RequireAuth roles={['advisor']}>{page(<AdvisorStudents />)}</RequireAuth>} />
          <Route path="advisor/students/:id" element={<RequireAuth roles={['advisor']}>{page(<StudentDetail />)}</RequireAuth>} />
          <Route path="admin" element={<RequireAuth roles={['admin']}>{page(<AdminOverview />)}</RequireAuth>} />
          <Route path="admin/import" element={<RequireAuth roles={['admin']}>{page(<AdminImport />)}</RequireAuth>} />
          <Route path="admin/sections" element={<RequireAuth roles={['admin']}>{page(<AdminSections />)}</RequireAuth>} />
          <Route path="admin/users" element={<RequireAuth roles={['admin']}>{page(<AdminUsers />)}</RequireAuth>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
