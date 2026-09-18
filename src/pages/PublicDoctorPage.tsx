import { Link, Navigate, useLocation, useParams } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import { SpecialtyThumbnail } from '../components/SpecialtyThumbnail'
import {
  buildPublicDemoPath,
  resolvePublicTenant,
} from '../domain/publicTenantResolver'
import { SPECIALTY_MODULES } from '../domain/specialtyRegistry'
import { useTenant } from '../domain/TenantContext'

export function PublicDoctorPage() {
  const { organizationSlug, cityCode, branchCode, doctorId } = useParams()
  const location = useLocation()
  const { data, organization: selectedOrganization } = useTenant()
  const tenant = resolvePublicTenant(data, {
    hostname: window.location.hostname,
    hostOverride: new URLSearchParams(location.search).get('host'),
    organizationSlug,
    cityCode,
    branchCode,
    fallbackOrganizationId: selectedOrganization.id,
  })
  const organization = tenant?.organization
  const candidateDoctor = data.practitioners.find(
    (item) =>
      item.id === doctorId &&
      item.organizationId === organization?.id &&
      item.active,
  )
  const clinic =
    tenant?.clinic ??
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

  if (!organization || !clinic || !doctor)
    return <Navigate to="/not-found" replace />

  const homePath = buildPublicDemoPath(
    organization,
    clinic,
    window.location.hostname,
  )
  const specialties = doctor.specialties.map(
    (specialtyId) => SPECIALTY_MODULES[specialtyId],
  )
  const primarySpecialty = doctor.specialties[0] ?? 'general_medicine'

  return (
    <div className="public-site">
      <PublicHeader organization={organization} homePath={homePath} />

      <main className="doctor-profile-page">
        <Link className="back-link" to={homePath}>
          ← Back to all doctors
        </Link>

        <section className="doctor-profile-hero">
          <SpecialtyThumbnail
            className="doctor-profile-thumbnail"
            specialtyId={primarySpecialty}
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
              <a className="btn" href={`tel:${doctor.phone}`}>
                Call {doctor.phone}
              </a>
              <a className="btn secondary" href={`mailto:${doctor.email}`}>
                Email doctor
              </a>
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
                <dd>{doctor.availabilitySummary || 'Contact clinic'}</dd>
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
      </main>

      <footer className="public-footer">
        <span>© {new Date().getFullYear()} {organization.name}</span>
        <span>For emergencies, contact your local emergency service.</span>
      </footer>
    </div>
  )
}
