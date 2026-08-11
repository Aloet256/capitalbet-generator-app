import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import type { ReactNode } from 'react'
import { ThemeProvider } from './context/ThemeContext'
import { BranchDeviceProvider, useBranchDevice } from './context/BranchDeviceContext'
import { AdminAuthProvider, useAdminAuth } from './context/AdminAuthContext'
import { BranchLayout } from './components/layout/BranchLayout'
import { AdminLayout } from './components/layout/AdminLayout'
import { Spinner } from './components/ui/Spinner'

import SelectBranch from './pages/branch/SelectBranch'
import Dashboard from './pages/branch/Dashboard'
import PowerMonitoring from './pages/branch/PowerMonitoring'
import Servicing from './pages/branch/Servicing'
import Utilities from './pages/branch/Utilities'
import Reports from './pages/branch/Reports'
import Notifications from './pages/branch/Notifications'

import Login from './pages/admin/Login'
import AdminDashboard from './pages/admin/AdminDashboard'
import BranchDetail from './pages/admin/BranchDetail'
import DeviceRequests from './pages/admin/DeviceRequests'
import AdminSettings from './pages/admin/AdminSettings'
import AdminReports from './pages/admin/AdminReports'

function RequireApprovedBranch({ children }: { children: ReactNode }) {
  const { branch, deviceStatus, loading } = useBranchDevice()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }
  if (!branch || deviceStatus !== 'approved') return <Navigate to="/" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: ReactNode }) {
  const { admin, loading } = useAdminAuth()
  const location = useLocation()
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Spinner size={32} />
      </div>
    )
  }
  if (!admin) return <Navigate to="/admin/login" replace />
  if (admin.must_change_password && location.pathname !== '/admin/settings') {
    return <Navigate to="/admin/settings" replace />
  }
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<SelectBranch />} />
      <Route
        path="/branch"
        element={
          <RequireApprovedBranch>
            <BranchLayout />
          </RequireApprovedBranch>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="power" element={<PowerMonitoring />} />
        <Route path="servicing" element={<Servicing />} />
        <Route path="utilities" element={<Utilities />} />
        <Route path="reports" element={<Reports />} />
        <Route path="notifications" element={<Notifications />} />
      </Route>

      <Route path="/admin/login" element={<Login />} />
      <Route
        path="/admin"
        element={
          <RequireAdmin>
            <AdminLayout />
          </RequireAdmin>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route path="dashboard" element={<AdminDashboard />} />
        <Route path="reports" element={<AdminReports />} />
        <Route path="branches/:id" element={<BranchDetail />} />
        <Route path="devices" element={<DeviceRequests />} />
        <Route path="settings" element={<AdminSettings />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  const basePath = import.meta.env.BASE_URL === '/' ? undefined : import.meta.env.BASE_URL.replace(/\/$/, '')

  return (
    <ThemeProvider>
      <BrowserRouter basename={basePath}>
        <BranchDeviceProvider>
          <AdminAuthProvider>
            <AppRoutes />
          </AdminAuthProvider>
        </BranchDeviceProvider>
      </BrowserRouter>
    </ThemeProvider>
  )
}
