import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_DATA } from './seed'
import {
  createClinic,
  createAppointmentRequest,
  createVisitNote,
  updateClinicRouting,
  updateAppointmentRequestStatus,
  upsertPatient,
  upsertPractitioner,
} from './reducers'

function cloneDemo() {
  return structuredClone(DEMO_DATA)
}

describe('pure reducers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns updated data without writing to localStorage', () => {
    const data = cloneDemo()

    const next = upsertPractitioner(data, data.context, {
      fullName: 'Dr. Reducer Only',
      email: 'reducer@example.com',
      phone: '+92 300 000 0000',
      specialties: ['dentistry'],
      active: true,
    })

    expect(next.practitioners).toHaveLength(data.practitioners.length + 1)
    expect(localStorage.getItem('clinic-hub-demo-v7')).toBeNull()
  })

  it('rejects duplicate practitioner emails within an organization', () => {
    const data = cloneDemo()

    expect(() =>
      upsertPractitioner(data, data.context, {
        fullName: 'Dr. Duplicate',
        email: ' IMRAN.GARDERZI@INDUS.DEMO ',
        phone: '+92 300 000 0000',
        specialties: ['dentistry'],
        active: true,
      }),
    ).toThrow('Duplicate practitioner email')
  })

  it('rejects patient assignments outside the selected clinic', () => {
    const data = cloneDemo()

    expect(() =>
      upsertPatient(data, data.context, {
        fullName: 'Misassigned patient',
        dateOfBirth: '1990-01-01',
        phone: '+92 300 000 0000',
        assignedPractitionerId: 'prac_a4',
      }),
    ).toThrow('Assigned practitioner must belong to the selected clinic')
  })

  it('rejects duplicate clinic slugs within an organization', () => {
    const data = cloneDemo()

    expect(() =>
      updateClinicRouting(data, data.context, {
        cityCode: 'khi',
        branchCode: '01',
        slug: 'gulberg',
      }),
    ).toThrow('Clinic slug is already assigned')
  })

  it('creates a clinic and grants the current membership access', () => {
    const data = cloneDemo()
    const next = createClinic(data, data.context, {
      name: 'Indus DHA Clinic',
      city: 'Lahore',
      cityCode: 'lhr',
      branchCode: '02',
      slug: 'dha',
      timezone: 'Asia/Karachi',
      phone: '+92 42 555 0101',
    })
    const created = next.clinics.find((clinic) => clinic.slug === 'dha')

    expect(created?.organizationId).toBe(data.context.organizationId)
    expect(next.memberships.find((item) => item.id === data.context.membershipId)?.clinicIds).toContain(created?.id)
  })

  it('rejects a duplicate clinic route when adding a clinic', () => {
    const data = cloneDemo()
    expect(() =>
      createClinic(data, data.context, {
        name: 'Duplicate route',
        city: 'Lahore',
        cityCode: 'lhr',
        branchCode: '01',
        slug: 'another',
        timezone: 'Asia/Karachi',
      }),
    ).toThrow('Clinic route is already assigned')
  })

  it('stores clinic contact details with routing settings', () => {
    const data = cloneDemo()
    const next = updateClinicRouting(data, data.context, {
      cityCode: 'khi',
      branchCode: '01',
      slug: 'clifton',
      phone: '+92 21 999 0000',
      email: 'new@example.com',
      address: 'New address',
      hours: 'Weekdays',
      mapUrl: 'https://maps.example.com/clinic',
      tagline: 'Care close to home.',
      heroCopy: 'Meet our team.',
      heroImageUrl: 'https://images.example.com/hero.jpg',
      whatsappUrl: 'https://wa.me/123',
    })

    expect(next.clinics[0]).toMatchObject({
      phone: '+92 21 999 0000',
      email: 'new@example.com',
      address: 'New address',
      hours: 'Weekdays',
      mapUrl: 'https://maps.example.com/clinic',
      tagline: 'Care close to home.',
      heroCopy: 'Meet our team.',
      heroImageUrl: 'https://images.example.com/hero.jpg',
      whatsappUrl: 'https://wa.me/123',
    })
  })

  it('does not persist a derived availability summary', () => {
    const data = cloneDemo()
    const next = upsertPractitioner(data, data.context, {
      fullName: 'Dr. Structured Availability',
      email: 'structured@example.com',
      phone: '+92 300 000 0000',
      specialties: ['dentistry'],
      active: true,
      availability: {
        days: [1, 2],
        startTime: '09:00',
        endTime: '12:00',
      },
    })

    expect(next.practitioners.at(-1)?.availabilitySummary).toBeUndefined()
  })

  it('persists uploaded practitioner photo data URLs on create and update', () => {
    const data = cloneDemo()
    const created = upsertPractitioner(data, data.context, {
      fullName: 'Dr. Photo Upload',
      email: 'photo-upload@example.com',
      phone: '+92 300 000 0000',
      specialties: ['dentistry'],
      active: true,
      photoUrl: 'data:image/png;base64,cG5n',
    })
    const practitioner = created.practitioners.at(-1)!
    expect(practitioner.photoUrl).toBe('data:image/png;base64,cG5n')

    const updated = upsertPractitioner(created, created.context, {
      id: practitioner.id,
      fullName: practitioner.fullName,
      email: practitioner.email,
      phone: practitioner.phone,
      specialties: practitioner.specialties,
      active: true,
      photoUrl: 'data:image/png;base64,updated',
    })
    expect(updated.practitioners.at(-1)?.photoUrl).toBe('data:image/png;base64,updated')
  })

  it('creates and updates a tenant-scoped appointment request', () => {
    const data = cloneDemo()
    const created = createAppointmentRequest(data, {
      organizationId: data.context.organizationId,
      clinicId: data.context.clinicId,
      practitionerId: 'prac_a1',
      patientName: 'New patient',
      phone: '+92 300 000 0000',
      preferredDay: 1,
    })
    const request = created.appointmentRequests[0]
    expect(request.status).toBe('new')

    const updated = updateAppointmentRequestStatus(
      created,
      created.context,
      request.id,
      'contacted',
    )
    expect(updated.appointmentRequests[0].status).toBe('contacted')
    expect(() =>
      updateAppointmentRequestStatus(
        updated,
        {
          organizationId: 'org_harbor',
          clinicId: 'clinic_harbor_downtown',
          membershipId: 'mem_harbor_admin',
        },
        request.id,
        'booked',
      ),
    ).toThrow('Tenant isolation')
  })

  it('creates a specialty visit note only for assigned module practitioners', () => {
    const data = cloneDemo()
    const next = createVisitNote(data, data.context, {
      patientId: 'pat_a1',
      practitionerId: 'prac_a1',
      specialtyId: 'general_medicine',
      content: 'Reviewed vitals and updated care plan.',
    })

    expect(next.visitNotes[0]).toMatchObject({
      patientId: 'pat_a1',
      specialtyId: 'general_medicine',
      content: 'Reviewed vitals and updated care plan.',
    })
    expect(() =>
      createVisitNote(data, data.context, {
        patientId: 'pat_a1',
        practitionerId: 'prac_a1',
        specialtyId: 'dentistry',
        content: 'Wrong module',
      }),
    ).toThrow('Practitioner is not assigned to this specialty')
  })
})
