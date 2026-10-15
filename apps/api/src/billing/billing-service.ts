import { randomUUID } from 'node:crypto'
import {
  CreatePlanSchema,
  EntitlementKeySchema,
  OPEN_SUBSCRIPTION_STATUSES,
  PlanEntitlementInputSchema,
  SubscriptionStatusSchema,
  entitlementKind,
  type BillingProvider,
  type EntitlementKey,
  type PlanEntitlementInput,
  type SubscriptionStatus,
} from '@clinic-hub/shared'
import { sql, type Kysely, type Transaction } from 'kysely'
import { z } from 'zod'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import type { ApiDatabase } from '../db/schema.js'
import { withTenant } from '../tenant/with-tenant.js'
import { assertEntitlement, EntitlementError } from './entitlement-service.js'

const TenantIdSchema = z.string().uuid()
const VersionIdSchema = z.string().uuid()
const InvoiceIdSchema = z.string().uuid()
const ReasonSchema = z.string().trim().min(20).max(500)
const MoneySchema = z.number().int().positive().max(1_000_000_000)
const CurrencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/)
const SourceRefSchema = z.string().trim().min(1).max(160)
const CustomerRefSchema = z.string().trim().min(1).max(160)

const STATUS_TRANSITIONS: Record<SubscriptionStatus, readonly SubscriptionStatus[]> = {
  trialing: ['active', 'past_due', 'suspended', 'canceled'],
  active: ['past_due', 'suspended', 'canceled'],
  past_due: ['active', 'suspended', 'canceled'],
  suspended: ['active', 'canceled'],
  canceled: [],
}

export class BillingError extends Error {
  constructor(readonly code: 'invalid' | 'not_found' | 'conflict' | 'immutable') {
    super(code)
    this.name = 'BillingError'
  }
}

interface NormalizedEntitlement {
  key: EntitlementKey
  kind: 'limit' | 'flag' | 'meter'
  limitValue: number | null
  flagEnabled: boolean | null
  includedQuantity: number | null
  overagePolicy: 'block' | 'allow' | 'informational' | null
}

function normalizeEntitlement(input: PlanEntitlementInput): NormalizedEntitlement {
  const parsed = PlanEntitlementInputSchema.parse(input)
  const kind = entitlementKind(parsed.key)
  if (kind === 'limit') {
    return {
      key: parsed.key,
      kind,
      limitValue: parsed.limit ?? null,
      flagEnabled: null,
      includedQuantity: null,
      overagePolicy: null,
    }
  }
  if (kind === 'flag') {
    return {
      key: parsed.key,
      kind,
      limitValue: null,
      flagEnabled: parsed.enabled ?? null,
      includedQuantity: null,
      overagePolicy: null,
    }
  }
  return {
    key: parsed.key,
    kind,
    limitValue: null,
    flagEnabled: null,
    includedQuantity: parsed.includedQuantity ?? null,
    overagePolicy: parsed.key === 'whatsapp.template_sends.monthly'
      ? 'informational'
      : parsed.overagePolicy ?? 'block',
  }
}

function assertDistinctKeys(entitlements: readonly NormalizedEntitlement[]): void {
  const keys = new Set(entitlements.map((entitlement) => entitlement.key))
  if (keys.size !== entitlements.length) throw new BillingError('invalid')
}

async function insertVersion(
  transaction: Transaction<ApiDatabase>,
  planId: string,
  versionNumber: number,
  entitlements: readonly NormalizedEntitlement[],
): Promise<string> {
  const versionId = randomUUID()
  await transaction
    .insertInto('plan_versions')
    .values({ id: versionId, plan_id: planId, version_number: versionNumber, status: 'published' })
    .execute()
  if (entitlements.length > 0) {
    await transaction
      .insertInto('plan_entitlements')
      .values(entitlements.map((entitlement) => ({
        id: randomUUID(),
        plan_version_id: versionId,
        entitlement_key: entitlement.key,
        kind: entitlement.kind,
        limit_value: entitlement.limitValue,
        flag_enabled: entitlement.flagEnabled,
        included_quantity: entitlement.includedQuantity,
        overage_policy: entitlement.overagePolicy,
      })))
      .execute()
  }
  return versionId
}

export async function createPlan(
  database: Kysely<ApiDatabase>,
  input: { key: string; name: string; entitlements: PlanEntitlementInput[] },
) {
  const parsed = CreatePlanSchema.parse(input)
  const entitlements = parsed.entitlements.map(normalizeEntitlement)
  assertDistinctKeys(entitlements)
  const id = randomUUID()
  try {
    const versionId = await database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto('plans')
        .values({ id, key: parsed.key, name: parsed.name, status: 'active' })
        .execute()
      return insertVersion(transaction, id, 1, entitlements)
    })
    return { id, key: parsed.key, name: parsed.name, versionId, versionNumber: 1 }
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new BillingError('conflict')
    throw error
  }
}

export async function publishPlanVersion(
  database: Kysely<ApiDatabase>,
  input: { planId: string; entitlements: PlanEntitlementInput[] },
) {
  const planId = z.string().uuid().parse(input.planId)
  const entitlements = z.array(PlanEntitlementInputSchema).min(1).parse(input.entitlements).map(normalizeEntitlement)
  assertDistinctKeys(entitlements)
  return database.transaction().execute(async (transaction) => {
    const plan = await transaction
      .selectFrom('plans')
      .select('id')
      .where('id', '=', planId)
      .where('status', '=', 'active')
      .executeTakeFirst()
    if (!plan) throw new BillingError('not_found')
    const latest = await transaction
      .selectFrom('plan_versions')
      .select('version_number')
      .where('plan_id', '=', planId)
      .orderBy('version_number', 'desc')
      .executeTakeFirst()
    const versionNumber = (latest?.version_number ?? 0) + 1
    const versionId = await insertVersion(transaction, planId, versionNumber, entitlements)
    return { planId, versionId, versionNumber }
  })
}

export async function createAddon(
  database: Kysely<ApiDatabase>,
  input: { key: string; name: string; entitlementKey: EntitlementKey; increment: number },
) {
  const key = z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:[._-][a-z0-9]+)*$/).max(64).parse(input.key)
  const name = z.string().trim().min(2).max(160).parse(input.name)
  const entitlementKey = EntitlementKeySchema.parse(input.entitlementKey)
  const increment = z.number().int().positive().max(1_000_000).parse(input.increment)
  if (entitlementKind(entitlementKey) === 'flag') throw new BillingError('invalid')
  const id = randomUUID()
  try {
    await database
      .insertInto('addons')
      .values({
        id,
        key,
        name,
        entitlement_key: entitlementKey,
        increment,
        status: 'active',
      })
      .execute()
  } catch (error) {
    if ((error as { code?: string }).code === '23505') throw new BillingError('conflict')
    throw error
  }
  return { id, key, entitlementKey, increment }
}

export async function startSubscription(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    customerRef: string
    planVersionId: string
    status: 'trialing' | 'active'
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const customerRef = CustomerRefSchema.parse(input.customerRef)
  const planVersionId = VersionIdSchema.parse(input.planVersionId)
  const status = z.enum(['trialing', 'active']).parse(input.status)
  const id = randomUUID()
  const periodStart = new Date()
  const periodEnd = new Date(periodStart.getTime() + 30 * 24 * 60 * 60 * 1000)
  try {
    await database.transaction().execute(async (transaction) => {
      const version = await transaction
        .selectFrom('plan_versions')
        .innerJoin('plans', 'plans.id', 'plan_versions.plan_id')
        .select('plan_versions.id')
        .where('plan_versions.id', '=', planVersionId)
        .where('plan_versions.status', '=', 'published')
        .where('plans.status', '=', 'active')
        .executeTakeFirst()
      if (!version) throw new BillingError('not_found')
      const tenant = await transaction
        .selectFrom('tenants')
        .select('id')
        .where('id', '=', tenantId)
        .executeTakeFirst()
      if (!tenant) throw new BillingError('not_found')
      await transaction
        .insertInto('subscriptions')
        .values({
          id,
          tenant_id: tenantId,
          plan_version_id: planVersionId,
          status,
          customer_ref: customerRef,
          trial_ends_at: status === 'trialing' ? periodEnd.toISOString() : null,
          current_period_start: periodStart.toISOString(),
          current_period_end: periodEnd.toISOString(),
          past_due_since: null,
          canceled_at: null,
        })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'subscription.started',
        resourceType: 'subscription',
        resourceId: id,
        metadata: { planVersionId, status },
      })
    })
  } catch (error) {
    if (error instanceof BillingError) throw error
    if ((error as { code?: string }).code === '23505') throw new BillingError('conflict')
    throw error
  }
  return { subscriptionId: id, tenantId, planVersionId, status }
}

export async function changePlan(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; planVersionId: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const planVersionId = VersionIdSchema.parse(input.planVersionId)
  return database.transaction().execute(async (transaction) => {
    const version = await transaction
      .selectFrom('plan_versions')
      .select('id')
      .where('id', '=', planVersionId)
      .where('status', '=', 'published')
      .executeTakeFirst()
    if (!version) throw new BillingError('not_found')
    const subscription = await transaction
      .selectFrom('subscriptions')
      .select(['id', 'plan_version_id'])
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', [...OPEN_SUBSCRIPTION_STATUSES])
      .executeTakeFirst()
    if (!subscription) throw new BillingError('not_found')
    await transaction
      .updateTable('subscriptions')
      .set({ plan_version_id: planVersionId })
      .where('id', '=', subscription.id)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'subscription.plan_changed',
      resourceType: 'subscription',
      resourceId: subscription.id,
      metadata: { previousPlanVersionId: subscription.plan_version_id, planVersionId },
    })
    return { subscriptionId: subscription.id, planVersionId }
  })
}

export async function setSubscriptionStatus(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; status: SubscriptionStatus },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const status = SubscriptionStatusSchema.parse(input.status)
  return database.transaction().execute(async (transaction) => {
    const subscription = await transaction
      .selectFrom('subscriptions')
      .select(['id', 'status'])
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', [...OPEN_SUBSCRIPTION_STATUSES])
      .executeTakeFirst()
    if (!subscription) throw new BillingError('not_found')
    const current = SubscriptionStatusSchema.parse(subscription.status)
    if (!STATUS_TRANSITIONS[current].includes(status)) throw new BillingError('conflict')
    const now = new Date().toISOString()
    await transaction
      .updateTable('subscriptions')
      .set({
        status,
        past_due_since: status === 'past_due' ? now : null,
        canceled_at: status === 'canceled' ? now : null,
      })
      .where('id', '=', subscription.id)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'subscription.status_changed',
      resourceType: 'subscription',
      resourceId: subscription.id,
      metadata: { previousStatus: current, status },
    })
    return { subscriptionId: subscription.id, status }
  })
}

export async function addSubscriptionAddon(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; addonId: string; quantity: number },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const addonId = z.string().uuid().parse(input.addonId)
  const quantity = z.number().int().positive().max(1_000).parse(input.quantity)
  const id = randomUUID()
  await database.transaction().execute(async (transaction) => {
    const addon = await transaction
      .selectFrom('addons')
      .select('id')
      .where('id', '=', addonId)
      .where('status', '=', 'active')
      .executeTakeFirst()
    if (!addon) throw new BillingError('not_found')
    const subscription = await transaction
      .selectFrom('subscriptions')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('status', 'in', [...OPEN_SUBSCRIPTION_STATUSES])
      .executeTakeFirst()
    if (!subscription) throw new BillingError('not_found')
    await transaction
      .insertInto('subscription_items')
      .values({
        id,
        tenant_id: tenantId,
        subscription_id: subscription.id,
        addon_id: addonId,
        quantity,
      })
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'subscription.addon_added',
      resourceType: 'subscription',
      resourceId: subscription.id,
      metadata: { addonId, quantity },
    })
  })
  return { id, tenantId, addonId, quantity }
}

export async function addEntitlementOverride(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    entitlementKey: EntitlementKey
    delta?: number
    enabled?: boolean
    reason: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const entitlementKey = EntitlementKeySchema.parse(input.entitlementKey)
  const reason = ReasonSchema.parse(input.reason)
  const kind = entitlementKind(entitlementKey)
  const delta = input.delta === undefined ? null : z.number().int().min(-1_000_000).max(1_000_000).refine((value) => value !== 0).parse(input.delta)
  const enabled = input.enabled
  if (kind === 'flag' && (enabled === undefined || delta !== null)) throw new BillingError('invalid')
  if (kind !== 'flag' && (delta === null || enabled !== undefined)) throw new BillingError('invalid')
  const tenant = await database.selectFrom('tenants').select('id').where('id', '=', tenantId).executeTakeFirst()
  if (!tenant) throw new BillingError('not_found')
  const id = randomUUID()
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto('entitlement_overrides')
      .values({
        id,
        tenant_id: tenantId,
        entitlement_key: entitlementKey,
        delta,
        flag_enabled: enabled ?? null,
        reason,
        actor_subject: actorSubject,
        expires_at: null,
      })
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'entitlement.override_added',
      resourceType: 'entitlement_override',
      resourceId: id,
      metadata: { entitlementKey, delta, enabled: enabled ?? null },
    })
  })
  return { id, tenantId, entitlementKey }
}

export async function issueInvoice(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; amountMinor: number; currency: string; externalReference?: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const amountMinor = MoneySchema.parse(input.amountMinor)
  const currency = CurrencySchema.parse(input.currency)
  const externalReference = input.externalReference === undefined
    ? null
    : z.string().trim().min(1).max(160).parse(input.externalReference)
  const id = randomUUID()
  try {
    await database.transaction().execute(async (transaction) => {
      const tenant = await transaction.selectFrom('tenants').select('id').where('id', '=', tenantId).executeTakeFirst()
      if (!tenant) throw new BillingError('not_found')
      const subscription = await transaction
        .selectFrom('subscriptions')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('status', 'in', [...OPEN_SUBSCRIPTION_STATUSES])
        .executeTakeFirst()
      await transaction
        .insertInto('invoices')
        .values({
          id,
          tenant_id: tenantId,
          subscription_id: subscription?.id ?? null,
          amount_minor: amountMinor,
          currency_code: currency,
          status: 'issued',
          issued_by_subject: actorSubject,
          external_reference: externalReference,
          paid_at: null,
        })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'invoice.issued',
        resourceType: 'invoice',
        resourceId: id,
        metadata: { amountMinor, currency },
      })
    })
  } catch (error) {
    if (error instanceof BillingError) throw error
    if ((error as { code?: string }).code === '23503') throw new BillingError('invalid')
    throw error
  }
  return { invoiceId: id, tenantId, amountMinor, currency, status: 'issued' as const }
}

export async function markInvoicePaid(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { invoiceId: string; providerRef: string },
) {
  const invoiceId = InvoiceIdSchema.parse(input.invoiceId)
  const providerRef = z.string().trim().min(1).max(160).parse(input.providerRef)
  return database.transaction().execute(async (transaction) => {
    const invoice = await transaction
      .selectFrom('invoices')
      .select(['id', 'tenant_id', 'status'])
      .where('id', '=', invoiceId)
      .executeTakeFirst()
    if (!invoice) throw new BillingError('not_found')
    if (invoice.status !== 'issued') throw new BillingError('conflict')
    await transaction
      .updateTable('invoices')
      .set({
        status: 'paid',
        paid_at: new Date().toISOString(),
        external_reference: providerRef,
      })
      .where('id', '=', invoice.id)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId: invoice.tenant_id,
      actorSubject,
      action: 'invoice.paid',
      resourceType: 'invoice',
      resourceId: invoice.id,
      metadata: { providerRef },
    })
    return { invoiceId: invoice.id, status: 'paid' as const }
  })
}

export async function recordUsage(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; key: EntitlementKey; quantity: number; sourceRef: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const key = EntitlementKeySchema.parse(input.key)
  const quantity = z.number().int().positive().max(1_000_000).parse(input.quantity)
  const sourceRef = SourceRefSchema.parse(input.sourceRef)
  if (entitlementKind(key) !== 'meter') throw new BillingError('invalid')
  return withTenant(database, tenantId, async (transaction) => {
    await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${tenantId}:usage:${sourceRef}`}, 0))`.execute(transaction)
    const existing = await transaction
      .selectFrom('usage_events')
      .select(['quantity'])
      .where('tenant_id', '=', tenantId)
      .where('source_ref', '=', sourceRef)
      .executeTakeFirst()
    if (existing) return { recorded: false, quantity: existing.quantity }
    try {
      await assertEntitlement(transaction, { tenantId, key, delta: quantity })
    } catch (error) {
      if (
        error instanceof EntitlementError &&
        error.code === 'entitlement_exceeded' &&
        key === 'whatsapp.template_sends.monthly'
      ) {
        // Informational meter still records the event.
      } else {
        throw error
      }
    }
    const period = await sql<{ period_start: string | Date }>`
      SELECT date_trunc('month', statement_timestamp())::date AS period_start
    `.execute(transaction)
    const rawPeriod = period.rows[0]?.period_start
    const periodStart = rawPeriod instanceof Date
      ? rawPeriod.toISOString().slice(0, 10)
      : String(rawPeriod).slice(0, 10)
    await transaction
      .insertInto('usage_events')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        entitlement_key: key,
        quantity,
        source_ref: sourceRef,
        period_start: periodStart,
      })
      .execute()
    await sql`
      INSERT INTO clinic_hub.usage_rollups (tenant_id, entitlement_key, period_start, quantity)
      VALUES (${tenantId}::uuid, ${key}, ${periodStart}::date, ${quantity})
      ON CONFLICT (tenant_id, entitlement_key, period_start)
      DO UPDATE SET quantity = clinic_hub.usage_rollups.quantity + EXCLUDED.quantity,
                    updated_at = statement_timestamp()
    `.execute(transaction)
    return { recorded: true, quantity }
  })
}

export async function readTenantBilling(database: Kysely<ApiDatabase>, tenantId: string) {
  const id = TenantIdSchema.parse(tenantId)
  return withTenant(database, id, async (transaction) => {
    const subscription = await transaction
      .selectFrom('subscriptions')
      .innerJoin('plan_versions', 'plan_versions.id', 'subscriptions.plan_version_id')
      .innerJoin('plans', 'plans.id', 'plan_versions.plan_id')
      .select([
        'subscriptions.id as subscriptionId',
        'subscriptions.status as status',
        'plans.key as planKey',
        'plans.name as planName',
        'plan_versions.version_number as versionNumber',
        'subscriptions.current_period_end as currentPeriodEnd',
      ])
      .where('subscriptions.tenant_id', '=', id)
      .where('subscriptions.status', 'in', [...OPEN_SUBSCRIPTION_STATUSES])
      .executeTakeFirst()
    const invoices = await transaction
      .selectFrom('invoices')
      .select(['id', 'amount_minor as amountMinor', 'currency_code as currency', 'status', 'issued_at as issuedAt'])
      .where('tenant_id', '=', id)
      .orderBy('issued_at', 'desc')
      .limit(20)
      .execute()
    return { subscription: subscription ?? null, invoices }
  })
}

export async function readUsage(database: Kysely<ApiDatabase>, tenantId: string) {
  const id = TenantIdSchema.parse(tenantId)
  return withTenant(database, id, async (transaction) => {
    const result = await sql<{ entitlementKey: string; periodStart: string; quantity: number }>`
      SELECT entitlement_key AS "entitlementKey",
             period_start AS "periodStart",
             quantity
      FROM clinic_hub.usage_rollups
      WHERE tenant_id = ${id}::uuid
        AND period_start = date_trunc('month', statement_timestamp())::date
      ORDER BY entitlement_key
    `.execute(transaction)
    return result.rows
  })
}

export function createManualBillingProvider(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
): BillingProvider {
  return {
    async createCustomer(input) {
      const tenantId = TenantIdSchema.parse(input.tenantId)
      const tenant = await database.selectFrom('tenants').select(['id', 'name']).where('id', '=', tenantId).executeTakeFirst()
      if (!tenant) throw new BillingError('not_found')
      return { customerRef: `manual:${tenant.id}` }
    },
    async startSubscription(input) {
      const started = await startSubscription(database, actorSubject, input)
      return { subscriptionId: started.subscriptionId }
    },
    async changePlan(input) {
      const changed = await changePlan(database, actorSubject, input)
      return { planVersionId: changed.planVersionId }
    },
    recordUsage(input) {
      return recordUsage(database, input)
    },
    async issueInvoice(input) {
      const issued = await issueInvoice(database, actorSubject, input)
      return { invoiceId: issued.invoiceId }
    },
    async handlePaymentNotice(input) {
      if (!input.paid) return { status: 'issued' as const }
      const paid = await markInvoicePaid(database, actorSubject, {
        invoiceId: input.invoiceId,
        providerRef: input.providerRef,
      })
      return { status: paid.status }
    },
  }
}
