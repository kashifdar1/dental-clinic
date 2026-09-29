import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { AvailabilityDialog } from '../components/AvailabilityDialog'
import { PractitionerImportPanel } from '../components/PractitionerImportPanel'
import { formatAvailability } from '../domain/availability'
import { allSpecialtyOptions } from '../domain/specialtyRegistry'
import { useTenant } from '../domain/TenantContext'
import type {
  AvailabilityWindow,
  Practitioner,
  SpecialtyId,
} from '../domain/types'

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  specialties: [] as SpecialtyId[],
  active: true,
  professionalSummary: '',
  qualifications: '',
  languages: '',
  availability: null as AvailabilityWindow | null,
  acceptingPatients: true,
}

export function PractitionersPage() {
  const { clinic, practitioners, savePractitioner, activeModules } = useTenant()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [error, setError] = useState('')
  const options = useMemo(() => allSpecialtyOptions(), [])

  useEffect(() => {
    setEditingId(null)
    setForm(emptyForm)
    setAvailabilityOpen(false)
    setError('')
  }, [clinic.id])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
  }

  function startEdit(practitioner: Practitioner) {
    setEditingId(practitioner.id)
    setForm({
      fullName: practitioner.fullName,
      email: practitioner.email,
      phone: practitioner.phone,
      specialties: [...practitioner.specialties],
      active: practitioner.active,
      professionalSummary: practitioner.professionalSummary ?? '',
      qualifications: practitioner.qualifications?.join(', ') ?? '',
      languages: practitioner.languages?.join(', ') ?? '',
      availability: practitioner.availability ?? null,
      acceptingPatients: practitioner.acceptingPatients ?? false,
    })
  }

  function toggleSpecialty(id: SpecialtyId) {
    setForm((current) => {
      const exists = current.specialties.includes(id)
      return {
        ...current,
        specialties: exists
          ? current.specialties.filter((item) => item !== id)
          : [...current.specialties, id],
      }
    })
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    if (!form.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    if (form.specialties.length === 0) {
      setError('Select at least one specialty.')
      return
    }
    const result = savePractitioner({
      id: editingId ?? undefined,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      specialties: form.specialties,
      active: form.active,
      professionalSummary: form.professionalSummary,
      qualifications: form.qualifications
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      languages: form.languages
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      availability: form.availability ?? undefined,
      acceptingPatients: form.acceptingPatients,
    })
    if (!result.ok) {
      setError(result.message)
      return
    }
    startCreate()
  }

  function setActive(practitioner: Practitioner, active: boolean) {
    const result = savePractitioner({
      id: practitioner.id,
      fullName: practitioner.fullName,
      email: practitioner.email,
      phone: practitioner.phone,
      specialties: practitioner.specialties,
      active,
      professionalSummary: practitioner.professionalSummary,
      qualifications: practitioner.qualifications,
      languages: practitioner.languages,
      availability: practitioner.availability,
      availabilitySummary: practitioner.availabilitySummary,
      acceptingPatients: practitioner.acceptingPatients,
    })
    if (!result.ok) {
      setError(result.message)
      return
    }
    if (editingId === practitioner.id) startCreate()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Practitioners</h1>
          <p>
            Add doctors and assign specialties. Active specialties drive the
            modules shown for this clinic ({activeModules.length} active).
          </p>
        </div>
      </div>

      <div className="admin-split">
        <form className="panel form-grid" onSubmit={onSubmit}>
          <div className="full">
            <h2>{editingId ? 'Edit practitioner' : 'Add practitioner'}</h2>
          </div>
          <div className="field full checklist">
            <label htmlFor="fullName">Full name</label>
            <input
              id="fullName"
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
          </div>
          <div className="field">
            <label htmlFor="phone">Phone</label>
            <input
              id="phone"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              required
            />
          </div>
          <div className="field full">
            <label htmlFor="professionalSummary">Public profile summary</label>
            <textarea
              id="professionalSummary"
              value={form.professionalSummary}
              onChange={(e) =>
                setForm({ ...form, professionalSummary: e.target.value })
              }
              placeholder="Describe clinical focus and approach"
            />
          </div>
          <div className="field full">
            <label htmlFor="qualifications">Qualifications</label>
            <input
              id="qualifications"
              value={form.qualifications}
              onChange={(e) =>
                setForm({ ...form, qualifications: e.target.value })
              }
              placeholder="MBBS, FCPS Cardiology"
            />
            <span className="field-hint">Separate each entry with a comma.</span>
          </div>
          <div className="field full">
            <label htmlFor="languages">Languages</label>
            <input
              id="languages"
              value={form.languages}
              onChange={(e) => setForm({ ...form, languages: e.target.value })}
              placeholder="English, Urdu"
            />
            <span className="field-hint">Separate each entry with a comma.</span>
          </div>
          <div className="field full">
            <label>Public availability</label>
            <button
              className="btn secondary availability-trigger"
              type="button"
              onClick={() => setAvailabilityOpen(true)}
            >
              {form.availability
                ? formatAvailability(form.availability)
                : 'Set days and hours'}
            </button>
            {form.availability ? (
              <button
                className="btn ghost availability-clear"
                type="button"
                onClick={() => setForm({ ...form, availability: null })}
              >
                Clear availability
              </button>
            ) : null}
          </div>
          <div className="field full">
            <label>Specialties</label>
            <div className="checklist">
              {options.map((option) => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={form.specialties.includes(option.id)}
                    onChange={() => toggleSpecialty(option.id)}
                  />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          <div className="field full">
            <label>
              <input
                type="checkbox"
                checked={form.active}
                onChange={(e) => setForm({ ...form, active: e.target.checked })}
              />{' '}
              Active (inactive practitioners do not enable modules)
            </label>
            <label>
              <input
                type="checkbox"
                checked={form.acceptingPatients}
                onChange={(e) =>
                  setForm({ ...form, acceptingPatients: e.target.checked })
                }
              />{' '}
              Accepting new patients
            </label>
          </div>
          <div className="btn-row full">
            <button className="btn" type="submit">
              {editingId ? 'Save changes' : 'Add doctor'}
            </button>
            {editingId ? (
              <button className="btn secondary" type="button" onClick={startCreate}>
                Cancel
              </button>
            ) : null}
          </div>
          {error ? (
            <div className="form-error full" role="alert">
              {error}
            </div>
          ) : null}
        </form>

        <div className="panel table-wrap">
          {practitioners.length === 0 ? (
            <div className="empty">No practitioners in this clinic yet.</div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Doctor</th>
                  <th>Specialties</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {practitioners.map((practitioner) => (
                  <tr key={practitioner.id}>
                    <td>
                      <strong>{practitioner.fullName}</strong>
                      <div className="muted">{practitioner.email}</div>
                    </td>
                    <td>
                      <div className="chip-row">
                        {practitioner.specialties.map((id) => {
                          const module = options.find((item) => item.id === id)
                          return (
                            <span key={id} className="chip">
                              {module?.shortLabel ?? id}
                            </span>
                          )
                        })}
                      </div>
                    </td>
                    <td>
                      <span className={`chip${practitioner.active ? '' : ' inactive'}`}>
                        {practitioner.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() => startEdit(practitioner)}
                        >
                          Edit
                        </button>
                        <button
                          className="btn ghost"
                          type="button"
                          onClick={() =>
                            setActive(practitioner, !practitioner.active)
                          }
                        >
                          {practitioner.active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
      <div style={{ marginTop: '1rem' }}>
        <PractitionerImportPanel />
      </div>

      {availabilityOpen ? (
        <AvailabilityDialog
          value={form.availability}
          onCancel={() => setAvailabilityOpen(false)}
          onSave={(availability) => {
            setForm((current) => ({ ...current, availability }))
            setAvailabilityOpen(false)
          }}
        />
      ) : null}
    </div>
  )
}
