import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { withTenant } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const LocationNameSchema = z.string().trim().min(2).max(160)
const LocationSlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
const TimeZoneSchema = z.string().trim().min(1).refine((value) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone: value })
    return true
  } catch {
    return false
  }
}, 'Invalid IANA timezone')

export class LocationError extends Error {
  constructor(readonly code: 'not_found' | 'slug_unavailable') {
    super(code)
    this.name = 'LocationError'
  }
}

export async function listLocations(database: Kysely<ApiDatabase>, tenantId: string) {
  const id = TenantIdSchema.parse(tenantId)
  return withTenant(database, id, (transaction) =>
    transaction
      .selectFrom('locations')
      .select(['id', 'tenant_id', 'name', 'slug', 'timezone', 'created_at'])
      .where('tenant_id', '=', id)
      .orderBy('created_at', 'asc')
      .execute(),
  )
}

export async function createLocation(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; name: string; slug: string; timezone: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const name = LocationNameSchema.parse(input.name)
  const slug = LocationSlugSchema.parse(input.slug)
  const timezone = TimeZoneSchema.parse(input.timezone)
  const id = randomUUID()

  try {
    await withTenant(database, tenantId, async (transaction) => {
      await transaction
        .insertInto('locations')
        .values({ id, tenant_id: tenantId, name, slug, timezone })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'location.created',
        resourceType: 'location',
        resourceId: id,
        metadata: { slug },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new LocationError('slug_unavailable')
    }
    throw error
  }

  return { id, tenantId, name, slug, timezone }
}

export async function updateLocation(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; locationId: string; name: string; slug: string; timezone: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const name = LocationNameSchema.parse(input.name)
  const slug = LocationSlugSchema.parse(input.slug)
  const timezone = TimeZoneSchema.parse(input.timezone)

  try {
    await withTenant(database, tenantId, async (transaction) => {
      const result = await transaction
        .updateTable('locations')
        .set({ name, slug, timezone })
        .where('tenant_id', '=', tenantId)
        .where('id', '=', locationId)
        .executeTakeFirst()
      if (result.numUpdatedRows === 0n) throw new LocationError('not_found')
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'location.updated',
        resourceType: 'location',
        resourceId: locationId,
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new LocationError('slug_unavailable')
    }
    throw error
  }

  return { id: locationId, tenantId, name, slug, timezone }
}
