import { Link, NavLink } from 'react-router-dom'
import { useTenant } from '../domain/TenantContext'

const appName = import.meta.env.VITE_APP_NAME?.trim() || 'Clinic Hub'

export function AppShell({ children }: { children: React.ReactNode }) {
  const {
    organization,
    clinic,
    membership,
    clinics,
    data,
    activeModules,
    switchOrganization,
    switchClinic,
  } = useTenant()

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">{appName}</div>
          <p className="brand-sub">
            Multi-org clinics with specialty modules that appear when you add
            practitioners.
          </p>
        </div>

        <nav className="nav-list" aria-label="Primary">
          <NavLink className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`} to="/admin" end>
            Dashboard
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            to="/admin/practitioners"
          >
            Practitioners
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            to="/admin/patients"
          >
            Patients
          </NavLink>
          <NavLink
            className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
            to="/admin/settings"
          >
            Organization settings
          </NavLink>

          <div className="nav-section-label">Active modules</div>
          {activeModules.length === 0 ? (
            <p className="muted" style={{ padding: '0.35rem 0.85rem' }}>
              Add a practitioner specialty to unlock modules.
            </p>
          ) : (
            activeModules.map((module) => (
              <NavLink
                key={module.id}
                className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}
                to={module.path}
              >
                <span>{module.label}</span>
                <span className="chip" style={{ background: `${module.accent}22`, color: module.accent }}>
                  {module.shortLabel}
                </span>
              </NavLink>
            ))
          )}
          <div className="nav-section-label">Public website</div>
          <Link className="nav-link" to={`/clinic/${organization.slug}`}>
            View website
          </Link>
        </nav>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="tenant-controls">
            <div className="field">
              <label htmlFor="org-select">Organization</label>
              <select
                id="org-select"
                value={organization.id}
                onChange={(e) => switchOrganization(e.target.value)}
              >
                {data.organizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="clinic-select">Clinic</label>
              <select
                id="clinic-select"
                value={clinic.id}
                onChange={(e) => switchClinic(e.target.value)}
              >
                {clinics.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="role-pill">
            {membership.displayName} · {membership.role}
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  )
}
