import { useState, type FormEvent } from 'react'
import { formatDate } from '../domain/regionalFormatting'
import { useTenant } from '../domain/TenantContext'

const emptyForm = {
  fullName: '',
  dateOfBirth: '',
  phone: '',
  assignedPractitionerId: '',
  notes: '',
}

export function PatientsPage() {
  const { organization, patients, practitioners, savePatient } = useTenant()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    const result = savePatient({
      fullName: form.fullName,
      dateOfBirth: form.dateOfBirth,
      phone: form.phone,
      assignedPractitionerId: form.assignedPractitionerId || undefined,
      notes: form.notes || undefined,
    })
    if (!result.ok) {
      setError(result.message)
      return
    }
    setForm(emptyForm)
  }

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
            <h2>Add patient</h2>
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
              Add patient
            </button>
          </div>
          {error ? (
            <div className="form-error full" role="alert">
              {error}
            </div>
          ) : null}
        </form>

        <div className="panel table-wrap">
          {patients.length === 0 ? (
            <div className="empty">No patients in this clinic yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Patient</th>
                  <th>DOB</th>
                  <th>Assigned</th>
                  <th>Notes</th>
                </tr>
              </thead>
              <tbody>
                {patients.map((patient) => {
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
