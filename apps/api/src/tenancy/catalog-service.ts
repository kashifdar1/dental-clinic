import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { ApiDatabase, CatalogOfferingStatus, PractitionerServiceStatus } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { withTenant, withTenantLocation } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const ServiceIdSchema = z.string().uuid()
const PractitionerIdSchema = z.string().uuid()
const NameSchema = z.string().trim().min(1).max(160)
const CategoryNameSchema = z.string().trim().min(1).max(120)
const SlugSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)
const DurationSchema = z.number().int().min(5).max(480)
const PriceSchema = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
const CurrencySchema = z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/)

export class CatalogError extends Error {
  constructor(readonly code:
    | 'not_found'
    | 'slug_unavailable'
    | 'already_offered'
    | 'not_active'
    | 'already_assigned'
    | 'price_currency_mismatch'
    | 'invalid_currency'
  ) {
    super(code)
    this.name = 'CatalogError'
  }
}

export async function listLocationCatalog(
  database: Kysely<ApiDatabase>,
  tenantId: string,
  locationId: string,
) {
  const scopedTenantId = TenantIdSchema.parse(tenantId)
  const scopedLocationId = LocationIdSchema.parse(locationId)

  return withTenantLocation(database, scopedTenantId, scopedLocationId, async (transaction) => {
    const offerings = await transaction
      .selectFrom('location_services as offering')
      .innerJoin('services as service', (join) =>
        join
          .onRef('service.tenant_id', '=', 'offering.tenant_id')
          .onRef('service.id', '=', 'offering.service_id'),
      )
      .innerJoin('service_categories as category', (join) =>
        join
          .onRef('category.tenant_id', '=', 'service.tenant_id')
          .onRef('category.id', '=', 'service.category_id'),
      )
      .select([
        'offering.id as offeringId',
        'service.id as serviceId',
        'service.name as serviceName',
        'service.slug as serviceSlug',
        'service.default_duration_minutes as defaultDurationMinutes',
        'category.id as categoryId',
        'category.name as categoryName',
        'offering.duration_override_minutes as durationOverrideMinutes',
        'offering.price_amount_minor as priceAmountMinor',
        'offering.currency_code as currencyCode',
        'offering.status as status',
      ])
      .where('offering.tenant_id', '=', scopedTenantId)
      .where('offering.location_id', '=', scopedLocationId)
      .orderBy('category.name', 'asc')
      .orderBy('service.name', 'asc')
      .execute()

    const practitionerServices = await transaction
      .selectFrom('practitioner_services as serviceAssignment')
      .innerJoin('practitioners as practitioner', (join) =>
        join
          .onRef('practitioner.tenant_id', '=', 'serviceAssignment.tenant_id')
          .onRef('practitioner.id', '=', 'serviceAssignment.practitioner_id'),
      )
      .innerJoin('practitioner_locations as locationAssignment', (join) =>
        join
          .onRef('locationAssignment.tenant_id', '=', 'serviceAssignment.tenant_id')
          .onRef('locationAssignment.practitioner_id', '=', 'serviceAssignment.practitioner_id')
          .onRef('locationAssignment.location_id', '=', 'serviceAssignment.location_id'),
      )
      .select([
        'serviceAssignment.service_id as serviceId',
        'practitioner.id as practitionerId',
        'practitioner.display_name as practitionerName',
        'serviceAssignment.status as status',
        'locationAssignment.status as locationStatus',
      ])
      .where('serviceAssignment.tenant_id', '=', scopedTenantId)
      .where('serviceAssignment.location_id', '=', scopedLocationId)
      .orderBy('practitioner.display_name', 'asc')
      .execute()

    const assignmentsByService = new Map<string, typeof practitionerServices>()
    for (const assignment of practitionerServices) {
      const entries = assignmentsByService.get(assignment.serviceId) ?? []
      entries.push(assignment)
      assignmentsByService.set(assignment.serviceId, entries)
    }

    return offerings.map((offering) => ({
      ...offering,
      priceAmountMinor: offering.priceAmountMinor === null
        ? null
        : Number(offering.priceAmountMinor),
      practitioners: (assignmentsByService.get(offering.serviceId) ?? []).map((assignment) => ({
        id: assignment.practitionerId,
        name: assignment.practitionerName,
        status: assignment.status,
        locationStatus: assignment.locationStatus,
      })),
    }))
  })
}

export async function createServiceCategory(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; name: string; slug: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const name = CategoryNameSchema.parse(input.name)
  const slug = SlugSchema.parse(input.slug)
  const id = randomUUID()

  try {
    await withTenant(database, tenantId, async (transaction) => {
      await transaction
        .insertInto('service_categories')
        .values({ id, tenant_id: tenantId, name, slug })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'catalog.category_created',
        resourceType: 'service_category',
        resourceId: id,
        metadata: { slug },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new CatalogError('slug_unavailable')
    }
    throw error
  }

  return { id, tenantId, name, slug }
}

export async function createService(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    categoryId: string
    name: string
    slug: string
    defaultDurationMinutes: number
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const categoryId = z.string().uuid().parse(input.categoryId)
  const name = NameSchema.parse(input.name)
  const slug = SlugSchema.parse(input.slug)
  const defaultDurationMinutes = DurationSchema.parse(input.defaultDurationMinutes)
  const id = randomUUID()

  try {
    await withTenant(database, tenantId, async (transaction) => {
      const category = await transaction
        .selectFrom('service_categories')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('id', '=', categoryId)
        .executeTakeFirst()
      if (!category) throw new CatalogError('not_found')

      await transaction
        .insertInto('services')
        .values({ id, tenant_id: tenantId, category_id: categoryId, name, slug, default_duration_minutes: defaultDurationMinutes })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'catalog.service_created',
        resourceType: 'service',
        resourceId: id,
        metadata: { categoryId, slug, defaultDurationMinutes },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new CatalogError('slug_unavailable')
    }
    throw error
  }

  return { id, tenantId, categoryId, name, slug, defaultDurationMinutes }
}

export async function createLocationOffering(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    serviceId: string
    durationOverrideMinutes?: number
    priceAmountMinor?: number
    currencyCode?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const serviceId = ServiceIdSchema.parse(input.serviceId)
  const durationOverrideMinutes = input.durationOverrideMinutes === undefined
    ? null
    : DurationSchema.parse(input.durationOverrideMinutes)
  const priceAmountMinor = input.priceAmountMinor === undefined
    ? null
    : PriceSchema.parse(input.priceAmountMinor)
  const currencyCode = input.currencyCode === undefined
    ? null
    : CurrencySchema.parse(input.currencyCode)
  if ((priceAmountMinor === null) !== (currencyCode === null)) {
    throw new CatalogError('price_currency_mismatch')
  }
  const id = randomUUID()

  try {
    await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      const service = await transaction
        .selectFrom('services')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('id', '=', serviceId)
        .executeTakeFirst()
      if (!service) throw new CatalogError('not_found')
      if (currencyCode !== null) {
        const supportedCurrency = await transaction
          .selectFrom('currency_codes')
          .select('code')
          .where('code', '=', currencyCode)
          .executeTakeFirst()
        if (!supportedCurrency) throw new CatalogError('invalid_currency')
      }

      await transaction
        .insertInto('location_services')
        .values({
          id,
          tenant_id: tenantId,
          location_id: locationId,
          service_id: serviceId,
          duration_override_minutes: durationOverrideMinutes,
          price_amount_minor: priceAmountMinor === null ? null : String(priceAmountMinor),
          currency_code: currencyCode,
          status: 'active',
        })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'catalog.location_offering_created',
        resourceType: 'location_service',
        resourceId: id,
        metadata: { locationId, serviceId, durationOverrideMinutes, priceAmountMinor, currencyCode },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new CatalogError('already_offered')
    }
    throw error
  }

  return { id, tenantId, locationId, serviceId, durationOverrideMinutes, priceAmountMinor, currencyCode, status: 'active' as const }
}

export async function updateLocationOffering(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    serviceId: string
    durationOverrideMinutes: number | null
    priceAmountMinor: number | null
    currencyCode: string | null
    status: CatalogOfferingStatus
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const serviceId = ServiceIdSchema.parse(input.serviceId)
  const durationOverrideMinutes = input.durationOverrideMinutes === null
    ? null
    : DurationSchema.parse(input.durationOverrideMinutes)
  const priceAmountMinor = input.priceAmountMinor === null
    ? null
    : PriceSchema.parse(input.priceAmountMinor)
  const currencyCode = input.currencyCode === null
    ? null
    : CurrencySchema.parse(input.currencyCode)
  const status = z.enum(['active', 'inactive']).parse(input.status)
  if ((priceAmountMinor === null) !== (currencyCode === null)) {
    throw new CatalogError('price_currency_mismatch')
  }

  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const offering = await transaction
      .selectFrom('location_services')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('service_id', '=', serviceId)
      .executeTakeFirst()
    if (!offering) throw new CatalogError('not_found')
    if (currencyCode !== null) {
      const supportedCurrency = await transaction
        .selectFrom('currency_codes')
        .select('code')
        .where('code', '=', currencyCode)
        .executeTakeFirst()
      if (!supportedCurrency) throw new CatalogError('invalid_currency')
    }

    const now = new Date().toISOString()
    await transaction
      .updateTable('location_services')
      .set({
        duration_override_minutes: durationOverrideMinutes,
        price_amount_minor: priceAmountMinor === null ? null : String(priceAmountMinor),
        currency_code: currencyCode,
        status,
        updated_at: now,
      })
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('service_id', '=', serviceId)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'catalog.location_offering_updated',
      resourceType: 'location_service',
      resourceId: offering.id,
      metadata: { locationId, serviceId, durationOverrideMinutes, priceAmountMinor, currencyCode, status },
    })
    return { id: offering.id, tenantId, locationId, serviceId, durationOverrideMinutes, priceAmountMinor, currencyCode, status }
  })
}

export async function assignPractitionerToService(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; locationId: string; serviceId: string; practitionerId: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const serviceId = ServiceIdSchema.parse(input.serviceId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const id = randomUUID()

  try {
    await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      const offering = await transaction
        .selectFrom('location_services')
        .select('status')
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('service_id', '=', serviceId)
        .executeTakeFirst()
      const practitioner = await transaction
        .selectFrom('practitioner_locations')
        .select(['status', 'verification_status', 'publication_state'])
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('practitioner_id', '=', practitionerId)
        .executeTakeFirst()
      if (!offering || !practitioner) throw new CatalogError('not_found')
      if (offering.status !== 'active'
        || practitioner.status !== 'active'
        || practitioner.verification_status !== 'verified'
        || practitioner.publication_state !== 'published') {
        throw new CatalogError('not_active')
      }

      await transaction
        .insertInto('practitioner_services')
        .values({
          id,
          tenant_id: tenantId,
          location_id: locationId,
          service_id: serviceId,
          practitioner_id: practitionerId,
          status: 'active',
        })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'catalog.practitioner_service_assigned',
        resourceType: 'practitioner_service',
        resourceId: id,
        metadata: { locationId, serviceId, practitionerId },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new CatalogError('already_assigned')
    }
    if ((error as { code?: string }).code === '23514') {
      throw new CatalogError('not_active')
    }
    throw error
  }

  return { id, tenantId, locationId, serviceId, practitionerId, status: 'active' as const }
}

export async function updatePractitionerServiceStatus(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    serviceId: string
    practitionerId: string
    status: PractitionerServiceStatus
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const serviceId = ServiceIdSchema.parse(input.serviceId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const status = z.enum(['active', 'inactive']).parse(input.status)

  try {
    return await withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const assignment = await transaction
      .selectFrom('practitioner_services')
      .select('id')
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('service_id', '=', serviceId)
      .where('practitioner_id', '=', practitionerId)
      .executeTakeFirst()
    if (!assignment) throw new CatalogError('not_found')
    if (status === 'active') {
      const offering = await transaction
        .selectFrom('location_services')
        .select('status')
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('service_id', '=', serviceId)
        .executeTakeFirst()
      const practitioner = await transaction
        .selectFrom('practitioner_locations')
        .select(['status', 'verification_status', 'publication_state'])
        .where('tenant_id', '=', tenantId)
        .where('location_id', '=', locationId)
        .where('practitioner_id', '=', practitionerId)
        .executeTakeFirst()
      if (offering?.status !== 'active'
        || practitioner?.status !== 'active'
        || practitioner.verification_status !== 'verified'
        || practitioner.publication_state !== 'published') {
        throw new CatalogError('not_active')
      }
    }

    await transaction
      .updateTable('practitioner_services')
      .set({ status })
      .where('tenant_id', '=', tenantId)
      .where('location_id', '=', locationId)
      .where('service_id', '=', serviceId)
      .where('practitioner_id', '=', practitionerId)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'catalog.practitioner_service_updated',
      resourceType: 'practitioner_service',
      resourceId: assignment.id,
      metadata: { locationId, serviceId, practitionerId, status },
    })
    return { ...input, status }
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23514') {
      throw new CatalogError('not_active')
    }
    throw error
  }
}