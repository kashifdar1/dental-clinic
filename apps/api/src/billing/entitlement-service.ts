import {
  EXPANDING_SUBSCRIPTION_STATUSES,
  OPEN_SUBSCRIPTION_STATUSES,
  combineAllowance,
  entitlementKind,
  type EntitlementKey,
  type OveragePolicy,
} from '@clinic-hub/shared'
import { sql, type Transaction } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'

const COUNTED_LIMITS = new Set<EntitlementKey>([
  'locations.max',
  'practitioners.max',
  'staff.seats.max',
])

export class EntitlementError extends Error {
  constructor(readonly code:
    | 'subscription_required'
    | 'entitlement_exceeded'
    | 'expansion_blocked'
    | 'usage_required'
  ) {
    super(code)
    this.name = 'EntitlementError'
  }
}

export async function assertEntitlement(
  transaction: Transaction<ApiDatabase>,
  input: {
    tenantId: string
    key: EntitlementKey
    delta?: number
    liveUsage?: number
  },
): Promise<void> {
  const delta = input.delta ?? 1
  if (!Number.isInteger(delta) || delta < 1) throw new EntitlementError('usage_required')
  await sql`SELECT pg_advisory_xact_lock(hashtextextended(${`${input.tenantId}:${input.key}`}, 0))`.execute(transaction)

  const subscription = await transaction
    .selectFrom('subscriptions')
    .select(['id', 'status', 'plan_version_id'])
    .where('tenant_id', '=', input.tenantId)
    .where('status', 'in', [...OPEN_SUBSCRIPTION_STATUSES])
    .executeTakeFirst()
  if (!subscription) throw new EntitlementError('subscription_required')
  if (!EXPANDING_SUBSCRIPTION_STATUSES.includes(subscription.status as 'trialing' | 'active')) {
    throw new EntitlementError('expansion_blocked')
  }

  const entitlement = await transaction
    .selectFrom('plan_entitlements')
    .select(['kind', 'limit_value', 'flag_enabled', 'included_quantity', 'overage_policy'])
    .where('plan_version_id', '=', subscription.plan_version_id)
    .where('entitlement_key', '=', input.key)
    .executeTakeFirst()
  const overrides = await transaction
    .selectFrom('entitlement_overrides')
    .select(['delta', 'flag_enabled', 'created_at'])
    .where('tenant_id', '=', input.tenantId)
    .where('entitlement_key', '=', input.key)
    .where((expression) => expression.or([
      expression('expires_at', 'is', null),
      expression('expires_at', '>', sql<Date>`statement_timestamp()`),
    ]))
    .orderBy('created_at', 'desc')
    .execute()
  const addons = await transaction
    .selectFrom('subscription_items')
    .innerJoin('addons', 'addons.id', 'subscription_items.addon_id')
    .select(['addons.increment', 'subscription_items.quantity'])
    .where('subscription_items.subscription_id', '=', subscription.id)
    .where('subscription_items.tenant_id', '=', input.tenantId)
    .where('addons.entitlement_key', '=', input.key)
    .where('addons.status', '=', 'active')
    .execute()
  const increments = addons.map((addon) => addon.increment * addon.quantity)
  const kind = entitlement?.kind ?? entitlementKind(input.key)

  if (kind === 'flag') {
    const override = overrides.find((item) => item.flag_enabled !== null)
    const enabled = override ? override.flag_enabled === true : entitlement?.flag_enabled === true
    if (!enabled) throw new EntitlementError('entitlement_exceeded')
    return
  }

  const base = kind === 'limit'
    ? entitlement?.limit_value ?? 0
    : entitlement?.included_quantity ?? 0
  const allowance = combineAllowance(base, [
    ...increments,
    ...overrides.flatMap((override) => override.delta === null ? [] : [override.delta]),
  ])
  const overage = (entitlement?.overage_policy ?? 'block') as OveragePolicy
  if (kind === 'meter' && (overage === 'allow' || overage === 'informational')) return

  const usage = await liveUsage(transaction, input.tenantId, input.key, input.liveUsage)
  if (usage + delta > allowance) throw new EntitlementError('entitlement_exceeded')
}

async function liveUsage(
  transaction: Transaction<ApiDatabase>,
  tenantId: string,
  key: EntitlementKey,
  supplied: number | undefined,
): Promise<number> {
  if (key === 'locations.max') {
    const result = await sql<{ live_count: number }>`
      SELECT count(*)::int AS live_count
      FROM clinic_hub.locations
      WHERE tenant_id = ${tenantId}::uuid
    `.execute(transaction)
    return Number(result.rows[0]?.live_count ?? 0)
  }
  if (key === 'practitioners.max') {
    const result = await sql<{ live_count: number }>`
      SELECT live_count
      FROM clinic_hub.entitlement_counters
      WHERE tenant_id = ${tenantId}::uuid
        AND entitlement_key = 'practitioners.max'
      FOR UPDATE
    `.execute(transaction)
    return Number(result.rows[0]?.live_count ?? 0)
  }
  if (key === 'staff.seats.max') {
    const result = await sql<{ live_count: number }>`
      SELECT (
        (SELECT count(*) FROM clinic_hub.memberships
          WHERE tenant_id = ${tenantId}::uuid AND status = 'active')
        + (SELECT count(*) FROM clinic_hub.invitations
          WHERE tenant_id = ${tenantId}::uuid AND status = 'pending')
      )::int AS live_count
    `.execute(transaction)
    return Number(result.rows[0]?.live_count ?? 0)
  }
  if (entitlementKind(key) === 'meter') {
    const result = await sql<{ quantity: number }>`
      SELECT COALESCE((
        SELECT quantity
        FROM clinic_hub.usage_rollups
        WHERE tenant_id = ${tenantId}::uuid
          AND entitlement_key = ${key}
          AND period_start = date_trunc('month', statement_timestamp())::date
      ), 0)::int AS quantity
    `.execute(transaction)
    return Number(result.rows[0]?.quantity ?? 0)
  }
  if (!COUNTED_LIMITS.has(key) && supplied === undefined) {
    throw new EntitlementError('usage_required')
  }
  if (supplied === undefined || !Number.isInteger(supplied) || supplied < 0) {
    throw new EntitlementError('usage_required')
  }
  return supplied
}
