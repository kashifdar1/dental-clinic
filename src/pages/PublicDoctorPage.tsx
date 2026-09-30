import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { DoctorAvatar } from '../components/DoctorAvatar'
import { PublicHeader } from '../components/PublicHeader'
import { usePageMetadata } from '../components/PageMetadata'
import { formatAvailability, WEEK_DAYS } from '../domain/availability'
import { getPublicContact } from '../domain/publicContact'
import { buildPublicDemoPath } from '../domain/publicTenantResolver'
import { SPECIALTY_MODULES } from '../domain/specialtyRegistry'
import { usePublicTenant } from '../public/PublicTenantContext'

export function PublicDoctorPage() {
  const { organizationSlug, doctorId } = useParams()
  const {
    data,
    organization,
    clinic: resolvedClinic,
    submitAppointmentRequest,
  } = usePublicTenant()
  const candidateDoctor = data.practitioners.find(
    (item) =>
      item.id === doctorId &&
      item.organizationId === organization?.id &&
      item.active,
  )
  const clinic =
    resolvedClinic ??
    (organizationSlug && candidateDoctor
      ? data.clinics.find((item) => item.id === candidateDoctor.clinicId)
      : undefined)
  const doctor = data.practitioners.find(
    (item) =>
      item.id === doctorId &&
      item.organizationId === organization?.id &&
      item.clinicId === clinic?.id &&
      item.active,
  )
  const [requestOpen, setRequestOpen] = useState(false)
  const [requestResult, setRequestResult] = useState<string | null>(null)
  const [requestForm, setRequestForm] = useState({
    patientName: '',
    phone: '',
    email: '',
    preferredDay: '',
    message: '',
  })

  usePageMetadata(
    doctor && organization
      ? `${doctor.fullName} | ${organization.name}`
      : 'Doctor profile | Clinic Hub',
    doctor && clinic
      ? `${doctor.fullName} at ${clinic.name}. View specialties, availability, and clinic contact details.`
      : 'View doctor profile and clinic contact details with Clinic Hub.',
  )

  if (!organization || !clinic || !doctor)
    return <Navigate to="/not-found" replace />

  const publicContact = getPublicContact(doctor, clinic)

  async function submitRequest(event: React.FormEvent) {
    event.preventDefault()
    if (!doctor) return
    const result = await submitAppointmentRequest({
      practitionerId: doctor.id,
      patientName: requestForm.patientName,
      phone: requestForm.phone,
      email: requestForm.email || undefined,
      preferredDay: requestForm.preferredDay
        ? Number(requestForm.preferredDay)
        : undefined,
      message: requestForm.message || undefined,
    })
    setRequestResult(result.ok ? 'Request sent to the clinic.' : result.message)
    if (result.ok) {
      setRequestForm({
        patientName: '',
        phone: '',
        email: '',
        preferredDay: '',
        message: '',
      })
    }
  }

  const homePath = buildPublicDemoPath(
    organization,
    clinic,
    window.location.hostname,
  )
  const specialties = doctor.specialties.map(
    (specialtyId) => SPECIALTY_MODULES[specialtyId],
  )
  return (
    <div className="public-site">
      <PublicHeader organization={organization} homePath={homePath} />

      <main className="doctor-profile-page">
        <Link className="back-link" to={homePath}>
          ← Back to all doctors
        </Link>

        <section className="doctor-profile-hero">
          <DoctorAvatar
            className="doctor-profile-thumbnail"
            practitioner={doctor}
          />
          <div className="doctor-profile-title">
            <div className="chip-row">
              {specialties.map((specialty) => (
                <span className="chip" key={specialty.id}>
                  {specialty.label}
                </span>
              ))}
            </div>
            <h1>{doctor.fullName}</h1>
            <p className="doctor-profile-qualifications">
              {doctor.qualifications?.join(' · ') ||
                'Qualified medical practitioner'}
            </p>
            <p>
              {doctor.professionalSummary ||
                'Contact the clinic for more information about this practitioner.'}
            </p>
            <div className="btn-row">
              {publicContact.phone ? (
                <a className="btn" href={`tel:${publicContact.phone}`}>
                  Call {publicContact.phone}
                </a>
              ) : null}
              {publicContact.email ? (
                <a className="btn secondary" href={`mailto:${publicContact.email}`}>
                  Email clinic
                </a>
              ) : null}
              <button className="btn secondary" type="button" onClick={() => setRequestOpen(true)}>
                Request appointment
              </button>
            </div>
          </div>
        </section>

        <div className="doctor-profile-grid">
          <section className="panel profile-section">
            <h2>About the doctor</h2>
            <dl className="profile-facts">
              <div>
                <dt>Clinic</dt>
                <dd>
                  {clinic?.name}
                  {clinic?.city ? `, ${clinic.city}` : ''}
                </dd>
              </div>
              <div>
                <dt>Availability</dt>
                <dd>
                  {doctor.availability
                    ? formatAvailability(doctor.availability)
                    : doctor.availabilitySummary || 'Contact clinic'}
                </dd>
              </div>
              <div>
                <dt>Languages</dt>
                <dd>{doctor.languages?.join(', ') || 'Contact clinic'}</dd>
              </div>
              <div>
                <dt>New patients</dt>
                <dd>
                  {doctor.acceptingPatients
                    ? 'Currently accepting'
                    : 'Existing patients only'}
                </dd>
              </div>
            </dl>
          </section>

          <section className="panel profile-section">
            <h2>Specialties and care</h2>
            <div className="profile-specialties">
              {specialties.map((specialty) => (
                <div key={specialty.id}>
                  <h3>{specialty.label}</h3>
                  <p className="muted">{specialty.description}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        {requestOpen ? (
          <section className="panel profile-section appointment-request">
            <div className="page-header">
              <div>
                <h2>Request an appointment</h2>
                <p className="muted">
                  Share your details and the clinic will contact you to confirm a time.
                </p>
              </div>
              <button
                className="btn ghost"
                type="button"
                onClick={() => setRequestOpen(false)}
              >
                Close
              </button>
            </div>
            <form className="form-grid" onSubmit={submitRequest}>
              <div className="field">
                <label htmlFor="requestPatientName">Your name</label>
                <input
                  id="requestPatientName"
                  value={requestForm.patientName}
                  onChange={(event) =>
                    setRequestForm({ ...requestForm, patientName: event.target.value })
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="requestPhone">Phone</label>
                <input
                  id="requestPhone"
                  value={requestForm.phone}
                  onChange={(event) =>
                    setRequestForm({ ...requestForm, phone: event.target.value })
                  }
                  required
                />
              </div>
              <div className="field">
                <label htmlFor="requestEmail">Email</label>
                <input
                  id="requestEmail"
                  type="email"
                  value={requestForm.email}
                  onChange={(event) =>
                    setRequestForm({ ...requestForm, email: event.target.value })
                  }
                />
              </div>
              {doctor.availability ? (
                <div className="field">
                  <label htmlFor="requestPreferredDay">Preferred day</label>
                  <select
                    id="requestPreferredDay"
                    value={requestForm.preferredDay}
                    onChange={(event) =>
                      setRequestForm({ ...requestForm, preferredDay: event.target.value })
                    }
                  >
                    <option value="">Any available day</option>
                    {WEEK_DAYS.filter((day) => doctor.availability?.days.includes(day.value)).map(
                      (day) => (
                        <option key={day.value} value={day.value}>
                          {day.label}
                        </option>
                      ),
                    )}
                  </select>
                </div>
              ) : null}
              <div className="field full">
                <label htmlFor="requestMessage">Message</label>
                <textarea
                  id="requestMessage"
                  value={requestForm.message}
                  onChange={(event) =>
                    setRequestForm({ ...requestForm, message: event.target.value })
                  }
                  placeholder="Tell the clinic anything helpful about your request."
                />
              </div>
              <div className="btn-row full">
                <button className="btn" type="submit">
                  Send request
                </button>
              </div>
              {requestResult ? (
                <div className="import-message full" role="status">
                  {requestResult}
                </div>
              ) : null}
            </form>
          </section>
        ) : null}
      </main>

      <footer className="public-footer">
        <span>© {new Date().getFullYear()} {organization.name}</span>
        <span>For emergencies, contact your local emergency service.</span>
      </footer>
    </div>
  )
}
