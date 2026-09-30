import { useState, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { SaveStatus } from '../components/SaveStatus'
import { SPECIALTY_MODULES, slugToSpecialty } from '../domain/specialtyRegistry'
import { useTenant, type MutationResult } from '../domain/TenantContext'

export function SpecialtyModulePage() {
  const { moduleSlug = '' } = useParams()
  const specialtyId = slugToSpecialty[moduleSlug]
  const {
    practitioners,
    patients,
    activeModules,
    visitNotes,
    saveVisitNote,
    status,
  } = useTenant()
  const [selectedPatientId, setSelectedPatientId] = useState('')
  const [selectedPractitionerId, setSelectedPractitionerId] = useState('')
  const [content, setContent] = useState('')
  const [result, setResult] = useState<MutationResult | null>(null)

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
  const moduleNotes = visitNotes.filter(
    (note) =>
      note.specialtyId === specialtyId &&
      relatedPatients.some((patient) => patient.id === note.patientId),
  )

  async function submitVisitNote(event: FormEvent) {
    event.preventDefault()
    const patientId = selectedPatientId || relatedPatients[0]?.id
    const practitionerId =
      selectedPractitionerId || modulePractitioners[0]?.id
    if (!patientId || !practitionerId) {
      setResult({ ok: false, message: 'Select a patient and practitioner.' })
      return
    }
    const nextResult = await saveVisitNote({
      patientId,
      practitionerId,
      specialtyId,
      content,
    })
    setResult(nextResult)
    if (nextResult.ok) {
      setContent('')
    }
  }

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
          <div className="chip-row stack-tight-lg">
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

      <section className="panel stack-section-sm">
        <h2 className="stack-tight-lg">Patient queue</h2>
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

      <section className="panel stack-section-sm">
        <div className="page-header">
          <div>
            <h2>Visit notes</h2>
            <p className="muted">Record a note for this specialty module.</p>
          </div>
        </div>
        {relatedPatients.length === 0 ? (
          <div className="empty">Assign a patient to a module practitioner to add a visit note.</div>
        ) : (
          <form className="form-grid" onSubmit={submitVisitNote}>
            <div className="field">
              <label htmlFor="visit-note-patient">Patient</label>
              <select
                id="visit-note-patient"
                value={selectedPatientId || relatedPatients[0].id}
                onChange={(event) => setSelectedPatientId(event.target.value)}
              >
                {relatedPatients.map((patient) => (
                  <option key={patient.id} value={patient.id}>
                    {patient.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="visit-note-practitioner">Practitioner</label>
              <select
                id="visit-note-practitioner"
                value={selectedPractitionerId || modulePractitioners[0]?.id}
                onChange={(event) => setSelectedPractitionerId(event.target.value)}
              >
                {modulePractitioners.map((practitioner) => (
                  <option key={practitioner.id} value={practitioner.id}>
                    {practitioner.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="field full">
              <label htmlFor="visit-note-content">Note</label>
              <textarea
                id="visit-note-content"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="Record findings, plan, or follow-up."
                required
              />
            </div>
            <div className="btn-row full">
              <button className="btn" type="submit">
                Save visit note
              </button>
            </div>
            <SaveStatus status={status} result={result} />
          </form>
        )}
        {moduleNotes.length > 0 ? (
          <div className="table-wrap stack-section-sm">
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>Practitioner</th>
                  <th>Note</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {moduleNotes.map((note) => (
                  <tr key={note.id}>
                    <td>{patients.find((patient) => patient.id === note.patientId)?.fullName ?? '—'}</td>
                    <td>{practitioners.find((practitioner) => practitioner.id === note.practitionerId)?.fullName ?? '—'}</td>
                    <td>{note.content}</td>
                    <td>{new Date(note.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  )
}
