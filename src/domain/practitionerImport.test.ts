import { describe, expect, it } from 'vitest'
import {
  createPractitionerCsvTemplate,
  exportPractitionersCsv,
  parsePractitionerCsv,
} from './practitionerImport'
import { DEMO_DATA } from './seed'

const clinics = DEMO_DATA.clinics.filter(
  (clinic) => clinic.organizationId === 'org_aurora',
)
const practitioners = DEMO_DATA.practitioners.filter(
  (practitioner) => practitioner.organizationId === 'org_aurora',
)

describe('practitioner CSV import', () => {
  it('matches clinics and specialty labels with quoted CSV values', () => {
    const csv = [
      'clinic,full_name,email,phone,specialties,active',
      '"Indus Clifton Clinic","Dr. Sana, Khan",sana@example.com,+92 300 123 4567,"GP|Dentistry",yes',
    ].join('\n')

    const preview = parsePractitionerCsv(csv, clinics, practitioners)

    expect(preview.fileErrors).toEqual([])
    expect(preview.rows[0].errors).toEqual([])
    expect(preview.rows[0].input).toMatchObject({
      clinicId: 'clinic_aurora_main',
      fullName: 'Dr. Sana, Khan',
      specialties: ['general_medicine', 'dentistry'],
      active: true,
    })
  })

  it('reports unknown clinics, specialties, and duplicate emails', () => {
    const csv = [
      'clinic,full_name,email,phone,specialties,active',
      'Unknown,Dr. One,imran.garderzi@indus.demo,+92 300 1,Neurology,true',
    ].join('\n')

    const preview = parsePractitionerCsv(csv, clinics, practitioners)
    expect(preview.rows[0].input).toBeUndefined()
    expect(preview.rows[0].errors.join(' ')).toMatch(/Clinic .* not found/i)
    expect(preview.rows[0].errors.join(' ')).toMatch(/already exists/i)
    expect(preview.rows[0].errors.join(' ')).toMatch(/Unknown specialties/i)
  })

  it('generates a template with all required columns', () => {
    const template = createPractitionerCsvTemplate(clinics)
    expect(template.split(/\r?\n/)[0]).toBe(
      'clinic,full_name,email,phone,specialties,active,qualifications,languages,availability_days,availability_start,availability_end,accepting_patients,photo_url',
    )
  })

  it('imports and exports richer practitioner fields', () => {
    const csv = [
      'clinic,full_name,email,phone,specialties,active,qualifications,languages,availability_days,availability_start,availability_end,accepting_patients,photo_url',
      'Indus Clifton Clinic,Dr. Rich,rich@example.com,+92 300 1,general_medicine,true,MBBS|FCPS,English|Urdu,Mon|Wed,09:00,17:00,false,https://example.com/rich.jpg',
    ].join('\n')
    const preview = parsePractitionerCsv(csv, clinics, practitioners)

    expect(preview.rows[0].errors).toEqual([])
    expect(preview.rows[0].input).toMatchObject({
      qualifications: ['MBBS', 'FCPS'],
      languages: ['English', 'Urdu'],
      acceptingPatients: false,
      photoUrl: 'https://example.com/rich.jpg',
      availability: { days: [1, 3], startTime: '09:00', endTime: '17:00' },
    })

    const exported = exportPractitionersCsv([practitioners[0]], clinics)
    expect(exported).toContain('qualifications')
    expect(exported).toContain('MBBS')
    expect(exported).toContain('availability_days')
  })
})
