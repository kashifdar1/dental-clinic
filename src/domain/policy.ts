import type { Membership, Role } from './types'

export type PolicyAction =
  | 'manageOrganization'
  | 'managePractitioners'
  | 'managePatients'

const permissions: Record<PolicyAction, Role[]> = {
  manageOrganization: ['owner', 'admin'],
  managePractitioners: ['owner', 'admin'],
  managePatients: ['owner', 'admin', 'receptionist'],
}

export function can(membership: Membership, action: PolicyAction): boolean {
  return permissions[action].includes(membership.role)
}