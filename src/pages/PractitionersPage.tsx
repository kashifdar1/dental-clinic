import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from 'react'
import { AvailabilityDialog } from '../components/AvailabilityDialog'
import { PractitionerImportPanel } from '../components/PractitionerImportPanel'
import { SaveStatus } from '../components/SaveStatus'
import { formatAvailability } from '../domain/availability'
import { allSpecialtyOptions } from '../domain/specialtyRegistry'
import { useTenant, type MutationResult } from '../domain/TenantContext'
import type {
  AvailabilityWindow,
  Practitioner,
  SpecialtyId,
} from '../domain/types'

const emptyForm = {
  fullName: '',
  email: '',
  phone: '',
  photoUrl: '',
  specialties: [] as SpecialtyId[],
  active: true,
  professionalSummary: '',
  qualifications: '',
  languages: '',
  availability: null as AvailabilityWindow | null,
  acceptingPatients: true,
}

const MAX_PHOTO_BYTES = 1024 * 1024

export function PractitionersPage() {
  const { clinic, practitioners, savePractitioner, activeModules, status } = useTenant()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [availabilityOpen, setAvailabilityOpen] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<MutationResult | null>(null)
  const options = useMemo(() => allSpecialtyOptions(), [])

  useEffect(() => {
    setEditingId(null)
    setForm(emptyForm)
    setAvailabilityOpen(false)
    setError('')
    setResult(null)
  }, [clinic.id])

  function startCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError('')
    setResult(null)
  }

  function startEdit(practitioner: Practitioner) {
    setEditingId(practitioner.id)
    setResult(null)
    setForm({
      fullName: practitioner.fullName,
      email: practitioner.email,
      phone: practitioner.phone,
      photoUrl: practitioner.photoUrl ?? '',
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

  function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Choose an image file.')
      event.target.value = ''
      return
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setError('Profile photos must be 1 MB or smaller.')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      setError('')
      setForm((current) => ({ ...current, photoUrl: String(reader.result) }))
    }
    reader.onerror = () => setError('Could not read the selected image.')
    reader.readAsDataURL(file)
    event.target.value = ''
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    setError('')
    setResult(null)
    if (!form.fullName.trim()) {
      setError('Full name is required.')
      return
    }
    if (form.specialties.length === 0) {
      setError('Select at least one specialty.')
      return
    }
    const result = await savePractitioner({
      id: editingId ?? undefined,
      fullName: form.fullName,
      email: form.email,
      phone: form.phone,
      photoUrl: form.photoUrl || undefined,
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
      setResult(result)
      return
    }
    startCreate()
    setResult(result)
  }

  async function setActive(practitioner: Practitioner, active: boolean) {
    const result = await savePractitioner({
      id: practitioner.id,
      fullName: practitioner.fullName,
      email: practitioner.email,
      phone: practitioner.phone,
      photoUrl: practitioner.photoUrl,
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
      setResult(result)
      return
    }
    if (editingId === practitioner.id) startCreate()
    setResult(result)
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
            <label htmlFor="photoUrl">Profile photo URL</label>
            <input
              id="photoUrl"
              value={form.photoUrl.startsWith('data:') ? '' : form.photoUrl}
              onChange={(e) => setForm({ ...form, photoUrl: e.target.value })}
              placeholder={
                form.photoUrl.startsWith('data:')
                  ? 'Uploaded image saved in demo data'
                  : 'https://example.com/doctor.jpg'
              }
            />
            <label htmlFor="photoUpload">Or upload a photo (1 MB max)</label>
            <input
              id="photoUpload"
              type="file"
              accept="image/*"
              onChange={selectPhoto}
            />
            {form.photoUrl ? (
              <img
                className="practitioner-photo-preview"
                src={form.photoUrl}
                alt="Profile photo preview"
              />
            ) : null}
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
          <fieldset className="field full">
            <legend>Public availability</legend>
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
          </fieldset>
          <fieldset className="field full">
            <legend>Specialties</legend>
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
          </fieldset>
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
          <SaveStatus status={status} result={result} />
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
                    <td data-label="Doctor">
                      <strong>{practitioner.fullName}</strong>
                      <div className="muted">{practitioner.email}</div>
                    </td>
                    <td data-label="Specialties">
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
                    <td data-label="Status">
                      <span className={`chip${practitioner.active ? '' : ' inactive'}`}>
                        {practitioner.active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td data-label="Actions">
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
      <div className="stack-section-sm">
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
