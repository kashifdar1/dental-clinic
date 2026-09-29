import type { SpecialtyId, SpecialtyModule } from './types'

export const SPECIALTY_MODULES: Record<SpecialtyId, SpecialtyModule> = {
  general_medicine: {
    id: 'general_medicine',
    label: 'General Medicine',
    shortLabel: 'GP',
    description: 'Primary care visits, vitals, and referral tracking.',
    path: '/admin/modules/general-medicine',
    accent: '#1f6f5b',
    workflowHints: [
      'Capture chief complaint and vitals',
      'Track chronic conditions',
      'Queue referrals to specialists',
    ],
  },
  gynecology: {
    id: 'gynecology',
    label: 'Gynecology',
    shortLabel: 'GYN',
    description: 'OB/GYN consults, cycle notes, and follow-up schedules.',
    path: '/admin/modules/gynecology',
    accent: '#8a3d5c',
    workflowHints: [
      'Document menstrual and obstetric history',
      'Plan screening intervals',
      'Coordinate prenatal follow-ups',
    ],
  },
  dentistry: {
    id: 'dentistry',
    label: 'Dentistry',
    shortLabel: 'Dental',
    description: 'Dental charting, procedures, and recall reminders.',
    path: '/admin/modules/dentistry',
    accent: '#2b5c8a',
    workflowHints: [
      'Record tooth-level findings',
      'Plan treatment sequences',
      'Schedule hygiene recalls',
    ],
  },
  pediatrics: {
    id: 'pediatrics',
    label: 'Pediatrics',
    shortLabel: 'Peds',
    description: 'Growth tracking, immunizations, and well-child visits.',
    path: '/admin/modules/pediatrics',
    accent: '#b06a1b',
    workflowHints: [
      'Track growth percentiles',
      'Log immunization status',
      'Prepare well-child checklists',
    ],
  },
  cardiology: {
    id: 'cardiology',
    label: 'Cardiology',
    shortLabel: 'Cardio',
    description: 'Cardiac risk review, ECG notes, and monitoring plans.',
    path: '/admin/modules/cardiology',
    accent: '#6b3fa0',
    workflowHints: [
      'Review risk factors',
      'Attach ECG summaries',
      'Set monitoring cadence',
    ],
  },
}

export const SPECIALTY_OPTIONS = Object.values(SPECIALTY_MODULES).sort((a, b) =>
  a.label.localeCompare(b.label),
)

export const slugToSpecialty: Record<string, SpecialtyId> = Object.fromEntries(
  Object.values(SPECIALTY_MODULES).map((module) => [
    module.path.split('/').pop() ?? module.id,
    module.id,
  ]),
)

export function modulesForSpecialties(specialtyIds: SpecialtyId[]): SpecialtyModule[] {
  const unique = [...new Set(specialtyIds)]
  return unique
    .map((id) => SPECIALTY_MODULES[id])
    .filter(Boolean)
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function allSpecialtyOptions(): SpecialtyModule[] {
  return SPECIALTY_OPTIONS
}
