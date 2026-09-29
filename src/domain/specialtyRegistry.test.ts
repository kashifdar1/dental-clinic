import { describe, expect, it } from 'vitest'
import {
  allSpecialtyOptions,
  slugToSpecialty,
  SPECIALTY_OPTIONS,
} from './specialtyRegistry'

describe('specialty registry lookups', () => {
  it('derives stable sorted options and route slugs from modules', () => {
    expect(allSpecialtyOptions()).toBe(SPECIALTY_OPTIONS)
    expect(allSpecialtyOptions().map((item) => item.label)).toEqual([
      'Cardiology',
      'Dentistry',
      'General Medicine',
      'Gynecology',
      'Pediatrics',
    ])
    expect(slugToSpecialty['general-medicine']).toBe('general_medicine')
    expect(slugToSpecialty.dentistry).toBe('dentistry')
  })
})
