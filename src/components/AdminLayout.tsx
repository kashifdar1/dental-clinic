import { Suspense } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useTenant } from '../domain/TenantContext'
import { AppShell } from './AppShell'

export function RequireMembership() {
  const { membership } = useTenant()
  return membership ? <Outlet /> : <Navigate to="/not-found" replace />
}

export function AdminLayout() {
  return (
    <AppShell>
      <Suspense fallback={<div className="empty">Loading admin page...</div>}>
        <Outlet />
      </Suspense>
    </AppShell>
  )
}
