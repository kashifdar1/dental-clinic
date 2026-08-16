import { Link } from 'react-router-dom'
import { getPolicyProfiles } from '../domain/policyRegistry'
import { useTenant } from '../domain/TenantContext'

export function DashboardPage() {
  const {
    organization,
    clinic,
    practitioners,
    patients,
    activeModules,
    resetDemo,
  } = useTenant()
  const policies = getPolicyProfiles(
    organization.governanceSettings.policyProfileIds,
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{clinic.name}</h1>
          <p>
            {organization.name} — modules unlock automatically from active
            practitioner specialties in this clinic.
          </p>
        </div>
        <div className="btn-row">
          <Link className="btn" to="/admin/practitioners">
            Manage practitioners
          </Link>
          <button className="btn secondary" type="button" onClick={resetDemo}>
            Reset demo data
          </button>
        </div>
      </div>

      <div className="grid stats">
        <div className="panel">
          <div className="muted">Practitioners</div>
          <div className="stat-value">{practitioners.length}</div>
        </div>
        <div className="panel">
          <div className="muted">Patients</div>
          <div className="stat-value">{patients.length}</div>
        </div>
        <div className="panel">
          <div className="muted">Active modules</div>
          <div className="stat-value">{activeModules.length}</div>
        </div>
        <div className="panel">
          <div className="muted">Region</div>
          <div className="stat-value" style={{ fontSize: '1.35rem' }}>
            {organization.regionalSettings.countryCode} ·{' '}
            {organization.regionalSettings.currency}
          </div>
          <div className="muted">{organization.regionalSettings.locale}</div>
        </div>
      </div>

      <section className="panel" style={{ marginTop: '1.25rem' }}>
        <div className="page-header" style={{ marginBottom: 0 }}>
          <div>
            <h2>Governance posture</h2>
            <p>
              {policies.map((policy) => policy.label).join(', ') ||
                'No policy profile selected'}
              . Configuration only—backend enforcement and legal review are
              still required.
            </p>
          </div>
          <Link className="btn secondary" to="/admin/settings">
            Configure
          </Link>
        </div>
      </section>

      <section style={{ marginTop: '1.25rem' }}>
        <div className="page-header">
          <div>
            <h2>Specialty modules</h2>
            <p>
              Add or update a doctor&apos;s specialties and the matching module
              appears in navigation for this clinic only.
            </p>
          </div>
        </div>

        {activeModules.length === 0 ? (
          <div className="empty">
            No specialty modules yet. Add a practitioner with at least one
            specialty.
          </div>
        ) : (
          <div className="grid cards">
            {activeModules.map((module) => (
              <Link
                key={module.id}
                to={module.path}
                className="panel module-card"
                style={{ ['--accent' as string]: module.accent }}
              >
                <div className="chip-row">
                  <span
                    className="chip"
                    style={{ background: `${module.accent}22`, color: module.accent }}
                  >
                    {module.shortLabel}
                  </span>
                </div>
                <h3>{module.label}</h3>
                <p className="muted">{module.description}</p>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  )
}
