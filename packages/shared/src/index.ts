export type IdentityProviderMode = 'local' | 'oidc'

export {
  PERMISSIONS,
  PermissionSchema,
  ROLE_PERMISSIONS,
  ROLES,
  RoleSchema,
  hasPermission,
} from './authorization.js'
export type { Permission, Role } from './authorization.js'

export interface AuthenticatedIdentity {
  subject: string
  realm: 'tenant' | 'platform'
  email?: string
  emailVerified: boolean
  mfaVerified: boolean
}

export interface Authenticator {
  authenticate(accessToken: string): Promise<AuthenticatedIdentity | null>
}
