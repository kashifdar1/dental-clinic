import { useEffect, useState, type FormEvent } from 'react'
import { SaveStatus } from '../components/SaveStatus'
import { formatDate } from '../domain/regionalFormatting'
import { useTenant, type MutationResult } from '../domain/TenantContext'

const emptyForm = {
  id: undefined as string | undefined,
  fullName: '',
  dateOfBirth: '',
  phone: '',
  assignedPractitionerId: '',
  notes: '',
  active: true,
}

export function PatientsPage() {
  const { clinic, organization, patients, practitioners, savePatient, status } = useTenant()
  const [form, setForm] = useState(emptyForm)
  const [search, setSearch] = useState('')
  const [showInactive, setShowInactive] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<MutationResult | null>(null)

  useEffect(() => {
    setForm(emptyForm)
    setError('')
    setResult(null)
  }, [clinic.id])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    if (!form.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    const result = await savePatient({
      id: form.id,
      fullName: form.fullName,
      dateOfBirth: form.dateOfBirth,
      phone: form.phone,
      assignedPractitionerId: form.assignedPractitionerId || undefined,
      notes: form.notes || undefined,
      active: form.active,
    })
    if (!result.ok) {
      setResult(result)
      return
    }
    setForm(emptyForm)
    setResult(result)
  }

  function startEdit(patient: (typeof patients)[number]) {
    setForm({
      id: patient.id,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      phone: patient.phone,
      assignedPractitionerId: patient.assignedPractitionerId ?? '',
      notes: patient.notes ?? '',
      active: patient.active !== false,
    })
    setError('')
    setResult(null)
  }

  async function setActive(patient: (typeof patients)[number], active: boolean) {
    const result = await savePatient({
      id: patient.id,
      fullName: patient.fullName,
      dateOfBirth: patient.dateOfBirth,
      phone: patient.phone,
      assignedPractitionerId: patient.assignedPractitionerId,
      notes: patient.notes,
      active,
    })
    if (!result.ok) {
      setResult(result)
      return
    }
    if (form.id === patient.id) setForm(emptyForm)
    setResult(result)
  }

  const normalizedSearch = search.trim().toLowerCase()
  const visiblePatients = patients.filter((patient) => {
    if (!showInactive && patient.active === false) return false
    if (!normalizedSearch) return true
    return [patient.fullName, patient.phone, patient.notes ?? ''].some((value) =>
      value.toLowerCase().includes(normalizedSearch),
    )
  })

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Patients</h1>
          <p>Scoped to the selected organization and clinic only.</p>
        </div>
      </div>

      <div className="admin-split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <div className="full">
            <h2>{form.id ? 'Edit patient' : 'Add patient'}</h2>
          </div>
          <div className="field full">
            <label htmlFor="patientName">Full name</label>
            <input
              id="patientName"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="dob">Date of birth</label>
            <input
              id="dob"
              type="date"
              value={form.dateOfBirth}
              onChange={(e) => setForm({ ...form, dateOfBirth: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="patientPhone">Phone</label>
            <input
              id="patientPhone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="assigned">Assigned practitioner</label>
            <select
              id="assigned"
              value={form.assignedPractitionerId}
              onChange={(e) =>
                setForm({ ...form, assignedPractitionerId: e.target.value })
              }
            >
              <option value="">Unassigned</option>
              {practitioners.map((practitioner) => (
                <option key={practitioner.id} value={practitioner.id}>
                  {practitioner.fullName}
                </option>
              ))}
            </select>
          </div>
          <div className="field full">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="btn-row full">
            <button className="btn" type="submit">
              {form.id ? 'Save changes' : 'Add patient'}
            </button>
            {form.id ? (
              <button
                className="btn secondary"
                type="button"
                onClick={() => setForm(emptyForm)}
              >
                Cancel
              </button>
            ) : null}
          </div>
          {error ? (
            <div className="form-error full" role="alert">
              {error}
            </div>
          ) : null}
          <SaveStatus status={status} result={result} />
        </form>

        <div className="panel table-wrap">
          <div className="patient-filters">
            <div className="field">
              <label htmlFor="patient-search">Search patients</label>
              <input
                id="patient-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, phone, or notes"
              />
            </div>
            <label className="checklist-inline">
              <input
                type="checkbox"
                checked={showInactive}
                onChange={(event) => setShowInactive(event.target.checked)}
              />
              Show inactive
            </label>
          </div>
          {visiblePatients.length === 0 ? (
            <div className="empty">No patients in this clinic yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>DOB</th>
                  <th>Assigned</th>
                  <th>Notes</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {visiblePatients.map((patient) => {
                  const assigned = practitioners.find(
                    (p) => p.id === patient.assignedPractitionerId,
                  )
                  return (
                    <tr key={patient.id}>
                      <td>
                        <strong>{patient.fullName}</strong>
                        <div className="muted">{patient.phone}</div>
                      </td>
                      <td>
                        {formatDate(
                          patient.dateOfBirth,
                          organization.regionalSettings,
                        )}
                      </td>
                      <td>{assigned?.fullName ?? 'Unassigned'}</td>
                      <td className="muted">{patient.notes ?? '—'}</td>
                      <td>
                        <span className={`chip${patient.active === false ? ' inactive' : ''}`}>
                          {patient.active === false ? 'Inactive' : 'Active'}
                        </span>
                      </td>
                      <td>
                        <div className="btn-row">
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => startEdit(patient)}
                          >
                            Edit
                          </button>
                          <button
                            className="btn ghost"
                            type="button"
                            onClick={() => setActive(patient, patient.active === false)}
                          >
                            {patient.active === false ? 'Reactivate' : 'Deactivate'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
