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

export interface ContactsTable {
  id: string
  tenant_id: string
  location_id: string
  display_name: string
  phone_e164: string
  email: string | null
  preferred_language: string | null
  external_patient_ref: string | null
  created_at: Timestamp
}

export interface ContactConsentEventsTable {
  id: string
  tenant_id: string
  contact_id: string
  channel: 'email' | 'sms' | 'whatsapp'
  purpose: 'appointment_updates' | 'marketing'
  state: 'granted' | 'withdrawn'
  source: 'web_form' | 'paper' | 'verbal' | 'staff_entry' | 'import'
  policy_version: string | null
  evidence_reference: string | null
  actor_subject: string
  recorded_at: Timestamp
}

export type PractitionerVerificationStatus = 'unverified' | 'pending' | 'verified' | 'rejected'
export type PractitionerAssignmentStatus = 'active' | 'inactive'
export type PractitionerPublicationState = 'draft' | 'published' | 'unpublished'

export interface PractitionersTable {
  id: string
  tenant_id: string
  display_name: string
  registration_authority: string
  registration_number: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface PractitionerLocationsTable {
  id: string
  tenant_id: string
  practitioner_id: string
  location_id: string
  status: PractitionerAssignmentStatus
  verification_status: PractitionerVerificationStatus
  verified_at: Timestamp | null
  verified_by_subject: string | null
  publication_state: PractitionerPublicationState
  created_at: Timestamp
  updated_at: Timestamp
}

export type CatalogOfferingStatus = 'active' | 'inactive'
export type PractitionerServiceStatus = 'active' | 'inactive'

export interface ServiceCategoriesTable {
  id: string
  tenant_id: string
  name: string
  slug: string
  created_at: Timestamp
}

export interface ServicesTable {
  id: string
  tenant_id: string
  category_id: string
  name: string
  slug: string
  default_duration_minutes: number
  created_at: Timestamp
}

export interface LocationServicesTable {
  id: string
  tenant_id: string
  location_id: string
  service_id: string
  duration_override_minutes: number | null
  price_amount_minor: string | null
  currency_code: string | null
  status: CatalogOfferingStatus
  created_at: Timestamp
  updated_at: Timestamp
}

export interface PractitionerServicesTable {
  id: string
  tenant_id: string
  location_id: string
  service_id: string
  practitioner_id: string
  status: PractitionerServiceStatus
  created_at: Timestamp
}

export interface CurrencyCodesTable {
  code: string
}

export interface SchedulesTable {
  id: string
  tenant_id: string
  location_id: string
  practitioner_id: string
  day_of_week: number
  start_time: string
  end_time: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface ScheduleExceptionsTable {
  id: string
  tenant_id: string
  location_id: string
  practitioner_id: string
  exception_date: string
  is_closed: boolean
  start_time: string | null
  end_time: string | null
  created_at: Timestamp
  updated_at: Timestamp
}

export type AppointmentStatus =
  | 'requested'
  | 'held'
  | 'confirmed'
  | 'cancelled'
  | 'declined'
  | 'expired'
  | 'rescheduled'

export interface AppointmentsTable {
  id: string
  tenant_id: string
  location_id: string
  contact_id: string
  service_id: string
  practitioner_id: string
  starts_at: Timestamp
  ends_at: Timestamp
  status: AppointmentStatus
  hold_expires_at: Timestamp | null
  rescheduled_from_id: string | null
  created_by_subject: string
  created_at: Timestamp
  updated_at: Timestamp
}

export interface AppointmentStatusHistoryTable {
  id: string
  tenant_id: string
  location_id: string
  appointment_id: string
  previous_status: AppointmentStatus | null
  new_status: AppointmentStatus
  actor_subject: string
  reason_code: string | null
  occurred_at: Timestamp
}

export interface AppointmentIdempotencyKeysTable {
  id: string
  tenant_id: string
  location_id: string
  idempotency_key: string
  request_hash: string
  appointment_id: string
  response_status: number
  response_body: unknown
  created_at: Timestamp
  expires_at: Timestamp
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
  contacts: ContactsTable
  contact_consent_events: ContactConsentEventsTable
  practitioners: PractitionersTable
  practitioner_locations: PractitionerLocationsTable
  service_categories: ServiceCategoriesTable
  services: ServicesTable
  location_services: LocationServicesTable
  practitioner_services: PractitionerServicesTable
  currency_codes: CurrencyCodesTable
  schedules: SchedulesTable
  schedule_exceptions: ScheduleExceptionsTable
  appointments: AppointmentsTable
  appointment_status_history: AppointmentStatusHistoryTable
  appointment_idempotency_keys: AppointmentIdempotencyKeysTable
}
