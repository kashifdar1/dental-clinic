import { lazy } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AdminLayout, RequireMembership } from './components/AdminLayout'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TenantProvider } from './domain/TenantContext'
import { NotFoundPage } from './pages/NotFoundPage'
import { LoginPage } from './pages/LoginPage'
import { PublicDirectoryPage } from './pages/PublicDirectoryPage'
import { PublicDoctorPage } from './pages/PublicDoctorPage'
import { PublicTenantProvider } from './public/PublicTenantContext'

const DashboardPage = lazy(async () => ({
  default: (await import('./pages/DashboardPage')).DashboardPage,
}))
const AppointmentRequestsPage = lazy(async () => ({
  default: (await import('./pages/AppointmentRequestsPage')).AppointmentRequestsPage,
}))
const OrganizationSettingsPage = lazy(async () => ({
  default: (await import('./pages/OrganizationSettingsPage')).OrganizationSettingsPage,
}))
const PatientsPage = lazy(async () => ({
  default: (await import('./pages/PatientsPage')).PatientsPage,
}))
const PractitionersPage = lazy(async () => ({
  default: (await import('./pages/PractitionersPage')).PractitionersPage,
}))
const SpecialtyModulePage = lazy(async () => ({
  default: (await import('./pages/SpecialtyModulePage')).SpecialtyModulePage,
}))

function PublicDirectoryRoute() {
  return (
    <PublicTenantProvider>
      <PublicDirectoryPage />
    </PublicTenantProvider>
  )
}

function PublicDoctorRoute() {
  return (
    <PublicTenantProvider>
      <PublicDoctorPage />
    </PublicTenantProvider>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <TenantProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={<PublicDirectoryRoute />}
            />
            <Route
              path="/doctors/:doctorId"
              element={<PublicDoctorRoute />}
            />
            <Route
              path="/:cityCode/:branchCode"
              element={<PublicDirectoryRoute />}
            />
            <Route
              path="/:cityCode/:branchCode/doctors/:doctorId"
              element={<PublicDoctorRoute />}
            />
            <Route
              path="/clinic/:organizationSlug"
              element={<PublicDirectoryRoute />}
            />
            <Route
              path="/clinic/:organizationSlug/doctors/:doctorId"
              element={<PublicDoctorRoute />}
            />
            <Route path="/admin" element={<AdminLayout />}>
              <Route element={<RequireMembership />}>
                <Route index element={<DashboardPage />} />
                <Route path="practitioners" element={<PractitionersPage />} />
                <Route path="patients" element={<PatientsPage />} />
                <Route path="appointments" element={<AppointmentRequestsPage />} />
                <Route path="settings" element={<OrganizationSettingsPage />} />
                <Route path="modules/:moduleSlug" element={<SpecialtyModulePage />} />
              </Route>
            </Route>
            <Route path="/not-found" element={<NotFoundPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="*" element={<Navigate to="/not-found" replace />} />
          </Routes>
        </BrowserRouter>
      </TenantProvider>
    </ErrorBoundary>
  )
}
