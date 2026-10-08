import type { ColumnType } from 'kysely'

type Timestamp = ColumnType<Date, string | undefined, string | undefined>

export type TenantLifecycleState =
  | 'draft'
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'closed'

export interface TenantsTable {
  id: string
  name: string
  slug: string
  lifecycle_state: TenantLifecycleState
  created_at: Timestamp
}

export interface LocationsTable {
  id: string
  tenant_id: string
  name: string
  slug: string
  timezone: string
  created_at: Timestamp
}

export interface MembershipsTable {
  id: string
  tenant_id: string
  identity_subject: string
  email: string
  display_name: string
  status: string
  created_at: Timestamp
}

export interface RoleAssignmentsTable {
  id: string
  tenant_id: string
  membership_id: string
  role_key: string
  scope: string
  scope_location_id: string | null
  created_at: Timestamp
}

export interface AuditEventsTable {
  id: string
  tenant_id: string
  actor_subject: string
  action: string
  resource_type: string
  resource_id: string | null
  metadata: unknown
  occurred_at: Timestamp
}

export interface AuthSessionsTable {
  session_hash: string
  identity_subject: string
  identity_realm: 'tenant' | 'platform'
  email: string | null
  email_verified: boolean
  mfa_verified: boolean
  csrf_hash: string
  created_at: Timestamp
  expires_at: Timestamp
  revoked_at: Timestamp | null
}

export interface InvitationsTable {
  id: string
  tenant_id: string
  email: string
  role_key: string
  scope: string
  scope_location_id: string | null
  invited_by_subject: string
  token_hash: string
  expires_at: Timestamp
  status: 'pending' | 'accepted' | 'revoked'
  accepted_at: Timestamp | null
  created_at: Timestamp
}

export interface PlatformStaffTable {
  id: string
  identity_subject: string
  email: string
  status: string
  created_at: Timestamp
}

export interface SecurityEventsTable {
  id: string
  event_type: string
  actor_subject: string | null
  identity_realm: string | null
  request_id: string | null
  metadata: unknown
  occurred_at: Timestamp
}

export interface SupportSessionsTable {
  id: string
  tenant_id: string
  platform_subject: string
  reason: string
  token_hash: string
  created_at: Timestamp
  expires_at: Timestamp
  revoked_at: Timestamp | null
}

export interface ApiDatabase {
  tenants: TenantsTable
  locations: LocationsTable
  memberships: MembershipsTable
  role_assignments: RoleAssignmentsTable
  audit_events: AuditEventsTable
  auth_sessions: AuthSessionsTable
  invitations: InvitationsTable
  platform_staff: PlatformStaffTable
  security_events: SecurityEventsTable
  support_sessions: SupportSessionsTable
}
