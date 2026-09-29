import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { PublicHeader } from '../components/PublicHeader'
import { SpecialtyThumbnail } from '../components/SpecialtyThumbnail'
import { buildPublicDemoPath } from '../domain/publicTenantResolver'
import { allSpecialtyOptions } from '../domain/specialtyRegistry'
import { usePublicTenant } from '../public/PublicTenantContext'
import type { SpecialtyId } from '../domain/types'

export function PublicDirectoryPage() {
  const { data, organization, clinic: resolvedClinic } = usePublicTenant()
  const [clinicId, setClinicId] = useState('all')
  const [specialtyId, setSpecialtyId] = useState<'all' | SpecialtyId>('all')

  useEffect(() => {
    setClinicId(resolvedClinic?.id ?? 'all')
    setSpecialtyId('all')
  }, [organization?.id, resolvedClinic?.id])

  const clinics = useMemo(
    () =>
      organization
        ? data.clinics.filter(
            (clinic) =>
              clinic.organizationId === organization.id &&
              (!resolvedClinic || clinic.id === resolvedClinic.id),
          )
        : [],
    [data.clinics, organization, resolvedClinic],
  )
  const doctors = useMemo(
    () =>
      organization
        ? data.practitioners.filter(
            (doctor) =>
              doctor.organizationId === organization.id &&
              doctor.active &&
              (clinicId === 'all' || doctor.clinicId === clinicId) &&
              (specialtyId === 'all' ||
                doctor.specialties.includes(specialtyId)),
          )
        : [],
    [clinicId, data.practitioners, organization, specialtyId],
  )
  const specialtyOptions = allSpecialtyOptions().filter((specialty) =>
    data.practitioners.some(
      (doctor) =>
        doctor.organizationId === organization?.id &&
        doctor.active &&
        (!resolvedClinic || doctor.clinicId === resolvedClinic.id) &&
        doctor.specialties.includes(specialty.id),
    ),
  )

  if (!organization) return <Navigate to="/not-found" replace />
  const homePath = buildPublicDemoPath(
    organization,
    resolvedClinic,
    window.location.hostname,
  )

  return (
    <div className="public-site">
      <PublicHeader organization={organization} homePath={homePath} />

      <main>
        <section className="public-hero">
          <div className="public-hero-copy">
            <span className="eyebrow">Trusted, connected care</span>
            <h1>Find the right doctor for your family.</h1>
            <p>
              Meet experienced practitioners across our clinics, explore their
              specialties, and contact the clinic directly.
            </p>
            <a className="btn" href="#doctors">
              Meet our doctors
            </a>
          </div>
          <div className="hero-note">
            <span className="hero-note-number">{doctors.length}</span>
            <span>
              active practitioners across {clinics.length}{' '}
              {clinics.length === 1 ? 'clinic' : 'clinics'}
            </span>
          </div>
        </section>

        <section className="public-doctors" id="doctors">
          <div className="public-section-heading">
            <div>
              <span className="eyebrow">Our clinical team</span>
              <h2>Doctors who listen, explain, and care.</h2>
            </div>
            <div className="directory-filters">
              {!resolvedClinic && clinics.length > 1 ? (
                <div className="field">
                  <label htmlFor="public-clinic-filter">Clinic</label>
                  <select
                    id="public-clinic-filter"
                    value={clinicId}
                    onChange={(event) => setClinicId(event.target.value)}
                  >
                    <option value="all">All clinics</option>
                    {clinics.map((clinic) => (
                      <option key={clinic.id} value={clinic.id}>
                        {clinic.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
              <div className="field">
                <label htmlFor="public-specialty-filter">Specialty</label>
                <select
                  id="public-specialty-filter"
                  value={specialtyId}
                  onChange={(event) =>
                    setSpecialtyId(event.target.value as 'all' | SpecialtyId)
                  }
                >
                  <option value="all">All specialties</option>
                  {specialtyOptions.map((specialty) => (
                    <option key={specialty.id} value={specialty.id}>
                      {specialty.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {doctors.length === 0 ? (
            <div className="empty">
              No doctors match these filters. Try another clinic or specialty.
            </div>
          ) : (
            <div className="doctor-card-grid">
              {doctors.map((doctor) => {
                const clinic = clinics.find(
                  (item) => item.id === doctor.clinicId,
                )
                const specialties = doctor.specialties.map(
                  (id) => allSpecialtyOptions().find((item) => item.id === id)!,
                )
                const primarySpecialty =
                  doctor.specialties[0] ?? 'general_medicine'
                return (
                  <article className="doctor-card" key={doctor.id}>
                    <SpecialtyThumbnail
                      className="doctor-thumbnail"
                      specialtyId={primarySpecialty}
                    />
                    <div className="doctor-card-body">
                      <div className="chip-row">
                        {specialties.map((specialty) => (
                          <span className="chip" key={specialty.id}>
                            {specialty.label}
                          </span>
                        ))}
                      </div>
                      <h3>{doctor.fullName}</h3>
                      <p className="doctor-qualification">
                        {doctor.qualifications?.join(' · ') ||
                          'Qualified medical practitioner'}
                      </p>
                      <p className="muted doctor-summary">
                        {doctor.professionalSummary ||
                          'View this doctor’s profile for specialty and contact information.'}
                      </p>
                      <div className="doctor-meta">
                        <span>{clinic?.name}</span>
                        {doctor.acceptingPatients ? (
                          <span className="accepting">Accepting patients</span>
                        ) : (
                          <span>Existing patients only</span>
                        )}
                      </div>
                      <Link
                        className="doctor-profile-link"
                        to={buildPublicDemoPath(
                          organization,
                          clinic,
                          window.location.hostname,
                          doctor.id,
                        )}
                      >
                        View profile <span aria-hidden="true">→</span>
                      </Link>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </section>

        <section className="public-contact" id="contact">
          <div>
            <span className="eyebrow">Need help choosing?</span>
            <h2>Contact your nearest clinic.</h2>
          </div>
          <div className="clinic-contact-grid">
            {clinics.map((clinic) => (
              <div key={clinic.id}>
                <strong>{clinic.name}</strong>
                <span>{clinic.city}</span>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="public-footer">
        <span>© {new Date().getFullYear()} {organization.name}</span>
        <span>For emergencies, contact your local emergency service.</span>
      </footer>
    </div>
  )
}
