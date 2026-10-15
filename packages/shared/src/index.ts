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
export {
  PRACTITIONER_CSV_HEADERS,
  PRACTITIONER_CSV_MAX_ROWS,
  PractitionerCsvImportErrorSchema,
  PractitionerCsvImportResultSchema,
  PractitionerCsvPreviewRowSchema,
  PractitionerCsvPreviewSchema,
  PractitionerCsvRequestSchema,
  PractitionerCsvRowSchema,
} from './practitioner-csv.js'
export type {
  PractitionerCsvImportError,
  PractitionerCsvImportResult,
  PractitionerCsvPreview,
  PractitionerCsvPreviewRow,
  PractitionerCsvRow,
} from './practitioner-csv.js'
export {
  API_CONTRACT_VERSION,
  HIS_EVENT_VERSION,
  HIS_REQUEST_VERSION,
  HISAppointmentEventSchema,
  HISAppointmentRequestSchema,
  IdempotencyKeySchema,
} from './his-contracts.js'
export type { HISAppointmentEvent, HISAppointmentRequest } from './his-contracts.js'
export {
  ENTITLEMENT_CATALOG,
  ENTITLEMENT_KEYS,
  EXPANDING_SUBSCRIPTION_STATUSES,
  EntitlementKeySchema,
  OPEN_SUBSCRIPTION_STATUSES,
  OveragePolicySchema,
  OVERAGE_POLICIES,
  PlanEntitlementInputSchema,
  CreatePlanSchema,
  SUBSCRIPTION_STATUSES,
  SubscriptionStatusSchema,
  combineAllowance,
  entitlementKind,
} from './billing.js'
export type {
  BillingProvider,
  CreatePlanInput,
  EntitlementKey,
  EntitlementKind,
  OveragePolicy,
  PlanEntitlementInput,
  SubscriptionStatus,
} from './billing.js'

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
