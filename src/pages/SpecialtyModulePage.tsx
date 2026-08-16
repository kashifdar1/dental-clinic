import { Link, Navigate, useParams } from 'react-router-dom'
import { SPECIALTY_MODULES } from '../domain/specialtyRegistry'
import { useTenant } from '../domain/TenantContext'
import type { SpecialtyId } from '../domain/types'

const PATH_TO_SPECIALTY: Record<string, SpecialtyId> = {
  'general-medicine': 'general_medicine',
  gynecology: 'gynecology',
  dentistry: 'dentistry',
  pediatrics: 'pediatrics',
  cardiology: 'cardiology',
}

export function SpecialtyModulePage() {
  const { moduleSlug = '' } = useParams()
  const specialtyId = PATH_TO_SPECIALTY[moduleSlug]
  const { practitioners, patients, activeModules } = useTenant()

  if (!specialtyId) {
    return <Navigate to="/not-found" replace />
  }

  const module = SPECIALTY_MODULES[specialtyId]
  const enabled = activeModules.some((item) => item.id === specialtyId)

  if (!enabled) {
    return (
      <div>
        <div className="page-header">
          <div>
            <h1>{module.label}</h1>
            <p>
              This module is not enabled for the current clinic. Add an active
              practitioner with the {module.label} specialty to unlock it.
            </p>
          </div>
          <Link className="btn" to="/admin/practitioners">
            Add practitioner
          </Link>
        </div>
      </div>
    )
  }

  const modulePractitioners = practitioners.filter(
    (p) => p.active && p.specialties.includes(specialtyId),
  )
  const relatedPatients = patients.filter((patient) =>
    modulePractitioners.some((p) => p.id === patient.assignedPractitionerId),
  )

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>{module.label}</h1>
          <p>{module.description}</p>
        </div>
      </div>

      <div className="grid cards">
        <div
          className="panel module-card"
          style={{ ['--accent' as string]: module.accent }}
        >
          <h2>Workflow hints</h2>
          <ul>
            {module.workflowHints.map((hint) => (
              <li key={hint}>{hint}</li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <div className="muted">Practitioners in module</div>
          <div className="stat-value">{modulePractitioners.length}</div>
          <div className="chip-row" style={{ marginTop: '0.85rem' }}>
            {modulePractitioners.map((practitioner) => (
              <span key={practitioner.id} className="chip">
                {practitioner.fullName}
              </span>
            ))}
          </div>
        </div>
        <div className="panel">
          <div className="muted">Assigned patients</div>
          <div className="stat-value">{relatedPatients.length}</div>
        </div>
      </div>

      <section className="panel" style={{ marginTop: '1rem' }}>
        <h2 style={{ marginBottom: '0.85rem' }}>Patient queue</h2>
        {relatedPatients.length === 0 ? (
          <div className="empty">
            No patients assigned to {module.label} practitioners yet.
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Assigned doctor</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {relatedPatients.map((patient) => {
                  const doctor = modulePractitioners.find(
                    (p) => p.id === patient.assignedPractitionerId,
                  )
                  return (
                    <tr key={patient.id}>
                      <td>{patient.fullName}</td>
                      <td>{doctor?.fullName ?? '—'}</td>
                      <td className="muted">{patient.notes ?? '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}
