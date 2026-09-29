import { describe, expect, it } from 'vitest'
import { can } from './policy'
import type { Membership } from './types'

const membership = (role: Membership['role']): Membership => ({
  id: `membership-${role}`,
  organizationId: 'org_aurora',
  displayName: role,
  email: `${role}@example.com`,
  role,
  clinicIds: ['clinic_aurora_main'],
})

describe('membership policy', () => {
  it('allows organization and practitioner management to owners and admins', () => {
    expect(can(membership('owner'), 'manageOrganization')).toBe(true)
    expect(can(membership('admin'), 'managePractitioners')).toBe(true)
    expect(can(membership('receptionist'), 'managePractitioners')).toBe(false)
  })

  it('allows receptionists to manage patients', () => {
    expect(can(membership('receptionist'), 'managePatients')).toBe(true)
    expect(can(membership('practitioner'), 'managePatients')).toBe(false)
  })
})