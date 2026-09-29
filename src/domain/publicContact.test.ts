import { describe, expect, it } from 'vitest'
import { DEMO_DATA } from './seed'
import { getPublicContact } from './publicContact'

describe('public contact', () => {
  it('uses clinic contact by default and explicit public contact when present', () => {
    const clinic = DEMO_DATA.clinics[0]
    const practitioner = DEMO_DATA.practitioners[0]

    expect(getPublicContact(practitioner, clinic)).toEqual({
      phone: clinic.phone,
      email: clinic.email,
    })
    expect(
      getPublicContact(
        { ...practitioner, publicContact: { phone: '+1 555 0100' } },
        clinic,
      ),
    ).toEqual({ phone: '+1 555 0100', email: clinic.email })
  })
})