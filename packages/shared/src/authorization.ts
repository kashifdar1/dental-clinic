import { z } from 'zod'

export const ROLES = [
  'platform_admin',
  'tenant_owner',
  'tenant_admin',
  'location_manager',
  'receptionist',
  'practitioner',
  'billing_admin',
  'content_editor',
] as const

export const RoleSchema = z.enum(ROLES)
export type Role = z.infer<typeof RoleSchema>

export const PERMISSIONS = [
  'location.manage',
  'practitioner.manage',
  'catalog.manage',
  'schedule.manage',
  'appointment.read',
  'appointment.manage',
  'contact.read',
  'inbox.read',
  'inbox.reply',
  'inbox.assign',
  'site.manage',
  'domain.manage',
  'billing.manage',
  'member.invite',
  'audit.read',
  'platform.tenant.read',
  'platform.tenant.manage',
  'platform.audit.read',
  'platform.impersonate',
] as const

export const PermissionSchema = z.enum(PERMISSIONS)
export type Permission = z.infer<typeof PermissionSchema>

const tenantManagementPermissions: readonly Permission[] = [
  'location.manage',
  'practitioner.manage',
  'catalog.manage',
  'schedule.manage',
  'appointment.read',
  'appointment.manage',
  'contact.read',
  'inbox.read',
  'inbox.reply',
  'inbox.assign',
  'site.manage',
  'domain.manage',
  'member.invite',
  'audit.read',
]

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> = {
  platform_admin: [
    'platform.tenant.read',
    'platform.tenant.manage',
    'platform.audit.read',
    'platform.impersonate',
  ],
  tenant_owner: [...tenantManagementPermissions, 'billing.manage'],
  tenant_admin: tenantManagementPermissions,
  location_manager: [
    'location.manage',
    'practitioner.manage',
    'catalog.manage',
    'schedule.manage',
    'appointment.read',
    'appointment.manage',
    'contact.read',
    'inbox.read',
    'inbox.reply',
    'inbox.assign',
    'site.manage',
  ],
  receptionist: [
    'appointment.read',
    'appointment.manage',
    'contact.read',
    'inbox.read',
    'inbox.reply',
    'inbox.assign',
  ],
  practitioner: ['appointment.read', 'contact.read', 'inbox.read', 'inbox.reply'],
  billing_admin: ['billing.manage', 'audit.read'],
  content_editor: ['site.manage'],
}

export function hasPermission(
  role: Role | string | null | undefined,
  permission: Permission,
): boolean {
  if (!role || !Object.hasOwn(ROLE_PERMISSIONS, role)) return false
  return ROLE_PERMISSIONS[role as Role].includes(permission)
}
