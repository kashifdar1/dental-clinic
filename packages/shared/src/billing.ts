import { z } from 'zod'

export const ENTITLEMENT_CATALOG = {
  'locations.max': 'limit',
  'practitioners.max': 'limit',
  'domains.custom.max': 'limit',
  'whatsapp.connections.max': 'limit',
  'staff.seats.max': 'limit',
  'storage.gb.max': 'limit',
  'automation.runs.monthly': 'meter',
  'whatsapp.template_sends.monthly': 'meter',
  'ai.credits.monthly': 'meter',
  'inbox.enabled': 'flag',
  'chatbot.enabled': 'flag',
  'site.branding_removal': 'flag',
  'api.access': 'flag',
} as const

export const ENTITLEMENT_KEYS = Object.keys(ENTITLEMENT_CATALOG) as [
  keyof typeof ENTITLEMENT_CATALOG,
  ...(keyof typeof ENTITLEMENT_CATALOG)[],
]

export const EntitlementKeySchema = z.enum(ENTITLEMENT_KEYS)
export type EntitlementKey = z.infer<typeof EntitlementKeySchema>
export type EntitlementKind = (typeof ENTITLEMENT_CATALOG)[EntitlementKey]

export const OVERAGE_POLICIES = ['block', 'allow', 'informational'] as const
export const OveragePolicySchema = z.enum(OVERAGE_POLICIES)
export type OveragePolicy = z.infer<typeof OveragePolicySchema>

export const SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
  'canceled',
] as const
export const SubscriptionStatusSchema = z.enum(SUBSCRIPTION_STATUSES)
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>

export const OPEN_SUBSCRIPTION_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'suspended',
] as const satisfies readonly SubscriptionStatus[]

export const EXPANDING_SUBSCRIPTION_STATUSES = ['trialing', 'active'] as const satisfies readonly SubscriptionStatus[]

const PlanKeySchema = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/).max(64)
const PlanNameSchema = z.string().trim().min(2).max(160)

export const PlanEntitlementInputSchema = z.object({
  key: EntitlementKeySchema,
  limit: z.number().int().min(0).max(1_000_000).optional(),
  enabled: z.boolean().optional(),
  includedQuantity: z.number().int().min(0).max(1_000_000_000).optional(),
  overagePolicy: OveragePolicySchema.optional(),
}).strict().superRefine((value, context) => {
  const kind = ENTITLEMENT_CATALOG[value.key]
  const present = [
    value.limit !== undefined,
    value.enabled !== undefined,
    value.includedQuantity !== undefined,
  ].filter(Boolean).length
  if (present !== 1) {
    context.addIssue({ code: 'custom', message: 'entitlement value is required' })
  }
  if (kind === 'limit' && value.limit === undefined) {
    context.addIssue({ code: 'custom', message: 'limit entitlement requires limit' })
  }
  if (kind === 'flag' && value.enabled === undefined) {
    context.addIssue({ code: 'custom', message: 'flag entitlement requires enabled' })
  }
  if (kind === 'meter' && value.includedQuantity === undefined) {
    context.addIssue({ code: 'custom', message: 'meter entitlement requires includedQuantity' })
  }
  if (
    value.key === 'whatsapp.template_sends.monthly' &&
    value.overagePolicy !== undefined &&
    value.overagePolicy !== 'informational'
  ) {
    context.addIssue({ code: 'custom', message: 'whatsapp template sends stay informational' })
  }
})

export type PlanEntitlementInput = z.infer<typeof PlanEntitlementInputSchema>

export const CreatePlanSchema = z.object({
  key: PlanKeySchema,
  name: PlanNameSchema,
  entitlements: z.array(PlanEntitlementInputSchema).min(1).max(ENTITLEMENT_KEYS.length),
}).strict()

export type CreatePlanInput = z.infer<typeof CreatePlanSchema>

export function combineAllowance(base: number, increments: readonly number[]): number {
  return Math.max(0, increments.reduce((sum, increment) => sum + increment, base))
}

export function entitlementKind(key: EntitlementKey): EntitlementKind {
  return ENTITLEMENT_CATALOG[key]
}

export interface BillingProvider {
  createCustomer(input: { tenantId: string; name: string }): Promise<{ customerRef: string }>
  startSubscription(input: {
    tenantId: string
    customerRef: string
    planVersionId: string
    status: 'trialing' | 'active'
  }): Promise<{ subscriptionId: string }>
  changePlan(input: { tenantId: string; planVersionId: string }): Promise<{ planVersionId: string }>
  recordUsage(input: {
    tenantId: string
    key: EntitlementKey
    quantity: number
    sourceRef: string
  }): Promise<{ recorded: boolean; quantity: number }>
  issueInvoice(input: {
    tenantId: string
    amountMinor: number
    currency: string
    externalReference?: string
  }): Promise<{ invoiceId: string }>
  handlePaymentNotice(input: {
    invoiceId: string
    providerRef: string
    paid: boolean
  }): Promise<{ status: 'paid' | 'issued' }>
}
