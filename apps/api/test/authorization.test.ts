import { describe, expect, it } from 'vitest'
import {
  PERMISSIONS,
  ROLE_PERMISSIONS,
  ROLES,
  hasPermission,
} from '@clinic-hub/shared'

describe('role permission matrix', () => {
  for (const role of ROLES) {
    for (const permission of PERMISSIONS) {
      it(`${role} ${ROLE_PERMISSIONS[role].includes(permission) ? 'can' : 'cannot'} ${permission}`, () => {
        expect(hasPermission(role, permission)).toBe(
          ROLE_PERMISSIONS[role].includes(permission),
        )
      })
    }
  }

  it('fails closed for missing or unrecognized roles', () => {
    expect(hasPermission(undefined, 'appointment.read')).toBe(false)
    expect(hasPermission('unknown_role', 'appointment.read')).toBe(false)
  })

  it('keeps platform permissions separate from tenant permissions', () => {
    expect(hasPermission('platform_admin', 'platform.tenant.manage')).toBe(true)
    expect(hasPermission('platform_admin', 'appointment.manage')).toBe(false)
    expect(hasPermission('tenant_owner', 'platform.tenant.manage')).toBe(false)
  })
})
