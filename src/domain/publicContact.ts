import type { Clinic, Practitioner } from './types'

export interface PublicContact {
  phone?: string
  email?: string
}

export function getPublicContact(
  practitioner: Practitioner,
  clinic: Clinic,
): PublicContact {
  return {
    phone: practitioner.publicContact?.phone || clinic.phone,
    email: practitioner.publicContact?.email || clinic.email,
  }
}
