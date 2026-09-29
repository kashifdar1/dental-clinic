import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_DATA } from './seed'
import {
  updateClinicRouting,
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
    })

    expect(next.clinics[0]).toMatchObject({
      phone: '+92 21 999 0000',
      email: 'new@example.com',
      address: 'New address',
      hours: 'Weekdays',
      mapUrl: 'https://maps.example.com/clinic',
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
})
