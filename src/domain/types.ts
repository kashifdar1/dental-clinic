export type Role = 'owner' | 'admin' | 'receptionist' | 'practitioner'

export type SpecialtyId =
  | 'general_medicine'
  | 'gynecology'
  | 'dentistry'
  | 'pediatrics'
  | 'cardiology'

export interface RegionalSettings {
  countryCode: string
  locale: string
  currency: string
  defaultTimeZone: string
  callingCode: string
}

export interface GovernanceSettings {
  policyProfileIds: string[]
  dataResidencyRegion: string
  recordRetentionDays: number
  requireMfa: boolean
  auditTrailRequired: boolean
  consentTrackingRequired: boolean
}

export type HostingMode = 'standalone' | 'multi_clinic'

export interface HostingSettings {
  mode: HostingMode
  primaryDomain: string
}

export interface Organization {
  id: string
  name: string
  slug: string
  hostingSettings: HostingSettings
  regionalSettings: RegionalSettings
  governanceSettings: GovernanceSettings
}

export interface Clinic {
  id: string
  organizationId: string
  name: string
  city: string
  cityCode: string
  branchCode: string
  slug: string
  timezone: string
}

/** Day numbers follow `Date.getDay()`: 0 is Sunday through 6 is Saturday. */
export interface AvailabilityWindow {
  days: number[]
  startTime: string
  endTime: string
}

export interface Practitioner {
  id: string
  organizationId: string
  clinicId: string
  fullName: string
  email: string
  phone: string
  specialties: SpecialtyId[]
  active: boolean
  professionalSummary?: string
  qualifications?: string[]
  languages?: string[]
  availability?: AvailabilityWindow
  availabilitySummary?: string
  acceptingPatients?: boolean
}

export type PractitionerImportInput = Omit<
  Practitioner,
  'id' | 'organizationId'
>

export interface Patient {
  id: string
  organizationId: string
  clinicId: string
  fullName: string
  dateOfBirth: string
  phone: string
  assignedPractitionerId?: string
  notes?: string
}

export interface Membership {
  id: string
  organizationId: string
  displayName: string
  email: string
  role: Role
  clinicIds: string[]
}

export interface TenantContext {
  organizationId: string
  clinicId: string
  membershipId: string
}

export interface AppData {
  organizations: Organization[]
  clinics: Clinic[]
  practitioners: Practitioner[]
  patients: Patient[]
  memberships: Membership[]
  context: TenantContext
}

export interface SpecialtyModule {
  id: SpecialtyId
  label: string
  shortLabel: string
  description: string
  path: string
  accent: string
  workflowHints: string[]
}
