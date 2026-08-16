import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { ErrorBoundary } from './components/ErrorBoundary'
import { TenantProvider } from './domain/TenantContext'
import { DashboardPage } from './pages/DashboardPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { OrganizationSettingsPage } from './pages/OrganizationSettingsPage'
import { PatientsPage } from './pages/PatientsPage'
import { PractitionersPage } from './pages/PractitionersPage'
import { PublicDirectoryPage } from './pages/PublicDirectoryPage'
import { PublicDoctorPage } from './pages/PublicDoctorPage'
import { SpecialtyModulePage } from './pages/SpecialtyModulePage'

export default function App() {
  return (
    <ErrorBoundary>
      <TenantProvider>
        <BrowserRouter>
          <Routes>
            <Route
              path="/"
              element={<PublicDirectoryPage />}
            />
            <Route
              path="/clinic/:organizationSlug"
              element={<PublicDirectoryPage />}
            />
            <Route
              path="/clinic/:organizationSlug/doctors/:doctorId"
              element={<PublicDoctorPage />}
            />
            <Route
              path="/admin"
              element={
                <AppShell>
                  <DashboardPage />
                </AppShell>
              }
            />
            <Route
              path="/admin/practitioners"
              element={
                <AppShell>
                  <PractitionersPage />
                </AppShell>
              }
            />
            <Route
              path="/admin/patients"
              element={
                <AppShell>
                  <PatientsPage />
                </AppShell>
              }
            />
            <Route
              path="/admin/settings"
              element={
                <AppShell>
                  <OrganizationSettingsPage />
                </AppShell>
              }
            />
            <Route
              path="/admin/modules/:moduleSlug"
              element={
                <AppShell>
                  <SpecialtyModulePage />
                </AppShell>
              }
            />
            <Route path="/not-found" element={<NotFoundPage />} />
            <Route path="*" element={<Navigate to="/not-found" replace />} />
          </Routes>
        </BrowserRouter>
      </TenantProvider>
    </ErrorBoundary>
  )
}
