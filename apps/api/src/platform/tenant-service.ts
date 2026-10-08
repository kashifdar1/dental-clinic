import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { ApiDatabase, TenantLifecycleState } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'

const TenantIdSchema = z.string().uuid()
const TenantNameSchema = z.string().trim().min(2).max(160)
const TenantSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)

const transitions: Record<TenantLifecycleState, readonly TenantLifecycleState[]> = {
  draft: ['trial', 'active', 'closed'],
  trial: ['active', 'past_due', 'suspended', 'closed'],
  active: ['past_due', 'suspended', 'closed'],
  past_due: ['active', 'suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
}

export class TenantLifecycleError extends Error {
  constructor(readonly code: 'not_found' | 'invalid_transition' | 'slug_unavailable') {
    super(code)
    this.name = 'TenantLifecycleError'
  }
}

export async function listTenants(database: Kysely<ApiDatabase>) {
  return database
    .selectFrom('tenants')
    .select(['id', 'name', 'slug', 'lifecycle_state', 'created_at'])
    .orderBy('created_at', 'desc')
    .execute()
}

export async function createTenant(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { name: string; slug: string },
) {
  const name = TenantNameSchema.parse(input.name)
  const slug = TenantSlugSchema.parse(input.slug)
  const id = randomUUID()

  try {
    await database.transaction().execute(async (transaction) => {
      await transaction
        .insertInto('tenants')
        .values({ id, name, slug, lifecycle_state: 'draft' })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId: id,
        actorSubject,
        action: 'tenant.created',
        resourceType: 'tenant',
        resourceId: id,
        metadata: { slug },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new TenantLifecycleError('slug_unavailable')
    }
    throw error
  }

  return { id, name, slug, lifecycleState: 'draft' as const }
}

export async function transitionTenant(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  tenantId: string,
  nextState: TenantLifecycleState,
) {
  const id = TenantIdSchema.parse(tenantId)
  return database.transaction().execute(async (transaction) => {
    const tenant = await transaction
      .selectFrom('tenants')
      .select(['id', 'lifecycle_state'])
      .where('id', '=', id)
      .forUpdate()
      .executeTakeFirst()
    if (!tenant) throw new TenantLifecycleError('not_found')
    if (tenant.lifecycle_state !== nextState && !transitions[tenant.lifecycle_state].includes(nextState)) {
      throw new TenantLifecycleError('invalid_transition')
    }

    await transaction
      .updateTable('tenants')
      .set({ lifecycle_state: nextState })
      .where('id', '=', id)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId: id,
      actorSubject,
      action: 'tenant.lifecycle_changed',
      resourceType: 'tenant',
      resourceId: id,
      metadata: { from: tenant.lifecycle_state, to: nextState },
    })

    return { id, lifecycleState: nextState }
  })
}
