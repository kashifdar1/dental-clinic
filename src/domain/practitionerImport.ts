import Papa from 'papaparse'
import {
  MINUTE_OPTIONS,
  WEEK_DAYS,
  validateAvailability,
} from './availability'
import { allSpecialtyOptions } from './specialtyRegistry'
import type {
  Clinic,
  Practitioner,
  PractitionerImportInput,
  SpecialtyId,
} from './types'

export const PRACTITIONER_IMPORT_HEADERS = [
  'clinic',
  'full_name',
  'email',
  'phone',
  'specialties',
  'active',
  'qualifications',
  'languages',
  'availability_days',
  'availability_start',
  'availability_end',
  'accepting_patients',
  'photo_url',
] as const

interface RawImportRow {
  clinic?: string
  full_name?: string
  email?: string
  phone?: string
  specialties?: string
  active?: string
  qualifications?: string
  languages?: string
  availability_days?: string
  availability_start?: string
  availability_end?: string
  accepting_patients?: string
  photo_url?: string
}

export interface PractitionerImportPreviewRow {
  rowNumber: number
  clinicLabel: string
  fullName: string
  email: string
  phone: string
  specialtyLabels: string[]
  active: boolean
  errors: string[]
  input?: PractitionerImportInput
}

export interface PractitionerImportPreview {
  rows: PractitionerImportPreviewRow[]
  fileErrors: string[]
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/[\s_-]+/g, '')
}

function parseActive(value: string): boolean | undefined {
  const normalized = value.trim().toLowerCase()
  if (['true', 'yes', '1', 'active'].includes(normalized)) return true
  if (['false', 'no', '0', 'inactive'].includes(normalized)) return false
  return undefined
}

function parseList(value: string | undefined): string[] | undefined {
  const items = value?.split(/[|;]/).map((item) => item.trim()).filter(Boolean)
  return items && items.length > 0 ? items : undefined
}

function parseAvailability(
  daysValue: string | undefined,
  startTime: string | undefined,
  endTime: string | undefined,
): { value?: PractitionerImportInput['availability']; error?: string } {
  if (!daysValue && !startTime && !endTime) return {}
  const days = (daysValue ?? '')
    .split(/[|;]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean)
    .map((item) => {
      const numeric = Number(item)
      if (!Number.isNaN(numeric) && numeric >= 0 && numeric <= 6) return numeric
      return WEEK_DAYS.find((day) => day.label.toLowerCase() === item || day.short.toLowerCase() === item)?.value
    })
    .filter((day): day is number => day !== undefined)
  const availability = {
    days: [...new Set(days)],
    startTime: startTime?.trim() ?? '',
    endTime: endTime?.trim() ?? '',
  }
  if (!availability.days.length || !MINUTE_OPTIONS.some((minute) => availability.startTime.endsWith(minute)) || !MINUTE_OPTIONS.some((minute) => availability.endTime.endsWith(minute))) {
    return { error: 'Availability requires valid days and HH:00/15/30/45 times' }
  }
  return { value: validateAvailability(availability) ? undefined : availability, error: validateAvailability(availability) ?? undefined }
}

function resolveSpecialties(value: string): {
  ids: SpecialtyId[]
  labels: string[]
  unknown: string[]
} {
  const options = allSpecialtyOptions()
  const values = value
    .split(/[|;]/)
    .map((item) => item.trim())
    .filter(Boolean)
  const ids: SpecialtyId[] = []
  const labels: string[] = []
  const unknown: string[] = []

  for (const item of values) {
    const key = normalize(item)
    const match = options.find(
      (option) =>
        normalize(option.id) === key ||
        normalize(option.label) === key ||
        normalize(option.shortLabel) === key,
    )
    if (!match) {
      unknown.push(item)
      continue
    }
    if (!ids.includes(match.id)) {
      ids.push(match.id)
      labels.push(match.label)
    }
  }

  return { ids, labels, unknown }
}

export function parsePractitionerCsv(
  csv: string,
  clinics: Clinic[],
  existingPractitioners: Practitioner[],
): PractitionerImportPreview {
  const result = Papa.parse<RawImportRow>(csv, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim().toLowerCase(),
  })
  const fileErrors = result.errors.map(
    (error) => `CSV row ${(error.row ?? 0) + 2}: ${error.message}`,
  )
  const fields = result.meta.fields ?? []
  const requiredHeaders = PRACTITIONER_IMPORT_HEADERS.slice(0, 6)
  const missingHeaders = requiredHeaders.filter((header) => !fields.includes(header))
  if (missingHeaders.length > 0) {
    fileErrors.push(`Missing columns: ${missingHeaders.join(', ')}`)
  }

  const existingEmails = new Set(
    existingPractitioners.map((item) => item.email.trim().toLowerCase()),
  )
  const fileEmails = new Set<string>()

  const rows = result.data.map((raw, index): PractitionerImportPreviewRow => {
    const errors: string[] = []
    const clinicValue = raw.clinic?.trim() ?? ''
    const fullName = raw.full_name?.trim() ?? ''
    const email = raw.email?.trim() ?? ''
    const phone = raw.phone?.trim() ?? ''
    const specialtyResult = resolveSpecialties(raw.specialties ?? '')
    const active = parseActive(raw.active ?? '')
    const acceptingPatients = parseActive(raw.accepting_patients ?? '')
    const availability = parseAvailability(
      raw.availability_days,
      raw.availability_start,
      raw.availability_end,
    )
    const clinic = clinics.find(
      (item) =>
        normalize(item.id) === normalize(clinicValue) ||
        normalize(item.name) === normalize(clinicValue),
    )

    if (!clinicValue) errors.push('Clinic is required')
    else if (!clinic) errors.push(`Clinic "${clinicValue}" was not found`)
    if (!fullName) errors.push('Full name is required')
    if (!email) errors.push('Email is required')
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      errors.push('Email format is invalid')
    else if (existingEmails.has(email.toLowerCase()))
      errors.push('Email already exists in this organization')
    else if (fileEmails.has(email.toLowerCase()))
      errors.push('Email is duplicated in this file')
    else fileEmails.add(email.toLowerCase())
    if (!phone) errors.push('Phone is required')
    if (specialtyResult.ids.length === 0)
      errors.push('At least one valid specialty is required')
    if (specialtyResult.unknown.length > 0)
      errors.push(
        `Unknown specialties: ${specialtyResult.unknown.join(', ')}`,
      )
    if (active === undefined)
      errors.push('Active must be true/false, yes/no, 1/0, or active/inactive')
    if (raw.accepting_patients && acceptingPatients === undefined)
      errors.push('Accepting patients must use the same true/false values as active')
    if (availability.error) errors.push(availability.error)

    const input =
      errors.length === 0 && clinic && active !== undefined
        ? {
            clinicId: clinic.id,
            fullName,
            email,
            phone,
            specialties: specialtyResult.ids,
            active,
            qualifications: parseList(raw.qualifications),
            languages: parseList(raw.languages),
            availability: availability.value,
            acceptingPatients: acceptingPatients ?? true,
            photoUrl: raw.photo_url?.trim() || undefined,
          }
        : undefined

    return {
      rowNumber: index + 2,
      clinicLabel: clinic?.name ?? clinicValue,
      fullName,
      email,
      phone,
      specialtyLabels: specialtyResult.labels,
      active: active ?? false,
      errors,
      input,
    }
  })

  return { rows, fileErrors }
}

export function createPractitionerCsvTemplate(clinics: Clinic[]): string {
  const clinic = clinics[0]
  return Papa.unparse([
    {
      clinic: clinic?.name ?? 'Clinic name',
      full_name: 'Dr. Example',
      email: 'doctor@example.com',
      phone: '+92 300 000 0000',
      specialties: 'general_medicine|dentistry',
      active: 'true',
      qualifications: 'MBBS|FCPS',
      languages: 'English|Urdu',
      availability_days: 'Mon|Wed|Fri',
      availability_start: '09:00',
      availability_end: '17:00',
      accepting_patients: 'true',
      photo_url: '',
    },
  ])
}

export function exportPractitionersCsv(
  practitioners: Practitioner[],
  clinics: Clinic[],
): string {
  return Papa.unparse(
    practitioners.map((practitioner) => {
      const clinic = clinics.find((item) => item.id === practitioner.clinicId)
      return {
        clinic: clinic?.name ?? practitioner.clinicId,
        full_name: practitioner.fullName,
        email: practitioner.email,
        phone: practitioner.phone,
        specialties: practitioner.specialties.join('|'),
        active: practitioner.active,
        qualifications: practitioner.qualifications?.join('|') ?? '',
        languages: practitioner.languages?.join('|') ?? '',
        availability_days:
          practitioner.availability?.days
            .map((day) => WEEK_DAYS.find((item) => item.value === day)?.short)
            .filter(Boolean)
            .join('|') ?? '',
        availability_start: practitioner.availability?.startTime ?? '',
        availability_end: practitioner.availability?.endTime ?? '',
        accepting_patients: practitioner.acceptingPatients ?? false,
        photo_url: practitioner.photoUrl ?? '',
      }
    }),
  )
}
