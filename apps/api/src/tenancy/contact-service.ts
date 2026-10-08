import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { withTenantLocation } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const ContactIdSchema = z.string().uuid()
const PhoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/)
const ExternalReferenceSchema = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,128}$/)
const LanguageSchema = z.string().trim().min(2).max(35).refine((value) => {
  try {
    return Intl.getCanonicalLocales(value).length === 1
  } catch {
    return false
  }
}).transform((value) => Intl.getCanonicalLocales(value)[0])

const ConsentInputSchema = z.object({
  channel: z.enum(['email', 'sms', 'whatsapp']),
  purpose: z.enum(['appointment_updates', 'marketing']),
  state: z.enum(['granted', 'withdrawn']),
  source: z.enum(['web_form', 'paper', 'verbal', 'staff_entry', 'import']),
  policyVersion: z.string().trim().regex(/^[A-Za-z0-9._:-]{1,64}$/).optional(),
  evidenceReference: z.string().trim().regex(/^[A-Za-z0-9._:-]{1,128}$/).optional(),
}).strict()

export class ContactError extends Error {
  constructor(readonly code: 'not_found' | 'channel_unavailable') {
    super(code)
    this.name = 'ContactError'
  }
}

export async function listContacts(
  database: Kysely<ApiDatabase>,
  tenantId: string,
  locationId: string,
) {
  const scopedTenantId = TenantIdSchema.parse(tenantId)
  const scopedLocationId = LocationIdSchema.parse(locationId)
  return withTenantLocation(database, scopedTenantId, scopedLocationId, (transaction) =>
    transaction
      .selectFrom('contacts')
      .select([
        'id',
        'tenant_id as tenantId',
        'location_id as locationId',
        'display_name as displayName',
        'phone_e164 as phoneE164',
        'email',
        'preferred_language as preferredLanguage',
        'external_patient_ref as externalPatientRef',
        'created_at as createdAt',
      ])
      .where('tenant_id', '=', scopedTenantId)
      .where('location_id', '=', scopedLocationId)
      .orderBy('created_at', 'desc')
      .execute(),
  )
}

export async function createContact(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    displayName: string
    phoneE164: string
    email?: string
    preferredLanguage?: string
    externalPatientRef?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const displayName = z.string().trim().min(1).max(160).parse(input.displayName)
  const phoneE164 = PhoneSchema.parse(input.phoneE164)
  const email = input.email === undefined
    ? null
    : z.string().trim().toLowerCase().email().max(254).parse(input.email)
  const preferredLanguage = input.preferredLanguage === undefined
    ? null
    : LanguageSchema.parse(input.preferredLanguage)
  const externalPatientRef = input.externalPatientRef === undefined
    ? null
    : ExternalReferenceSchema.parse(input.externalPatientRef)
  const id = randomUUID()

  await withTenantLocation(database, tenantId, locationId, async (transaction) => {
    await transaction
      .insertInto('contacts')
      .values({
        id,
        tenant_id: tenantId,
        location_id: locationId,
        display_name: displayName,
        phone_e164: phoneE164,
        email,
        preferred_language: preferredLanguage,
        external_patient_ref: externalPatientRef,
      })
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'contact.created',
      resourceType: 'contact',
      resourceId: id,
      metadata: { locationId },
    })
  })

  return {
    id,
    tenantId,
    locationId,
    displayName,
    phoneE164,
    email,
    preferredLanguage,
    externalPatientRef,
  }
}

export async function listContactConsentEvents(
  database: Kysely<ApiDatabase>,
  input: { tenantId: string; locationId: string; contactId: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const contactId = ContactIdSchema.parse(input.contactId)

  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const contact = await transaction
      .selectFrom('contacts')
      .select('id')
      .where('id', '=', contactId)
      .where('location_id', '=', locationId)
      .executeTakeFirst()
    if (!contact) throw new ContactError('not_found')

    return transaction
      .selectFrom('contact_consent_events')
      .select([
        'id',
        'channel',
        'purpose',
        'state',
        'source',
        'policy_version as policyVersion',
        'evidence_reference as evidenceReference',
        'actor_subject as actorSubject',
        'recorded_at as recordedAt',
      ])
      .where('tenant_id', '=', tenantId)
      .where('contact_id', '=', contactId)
      .orderBy('recorded_at', 'desc')
      .execute()
  })
}

export async function recordContactConsent(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    contactId: string
    channel: 'email' | 'sms' | 'whatsapp'
    purpose: 'appointment_updates' | 'marketing'
    state: 'granted' | 'withdrawn'
    source: 'web_form' | 'paper' | 'verbal' | 'staff_entry' | 'import'
    policyVersion?: string
    evidenceReference?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const contactId = ContactIdSchema.parse(input.contactId)
  const consent = ConsentInputSchema.parse({
    channel: input.channel,
    purpose: input.purpose,
    state: input.state,
    source: input.source,
    policyVersion: input.policyVersion,
    evidenceReference: input.evidenceReference,
  })
  const id = randomUUID()

  const recordedAt = await withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const contact = await transaction
      .selectFrom('contacts')
      .select(['id', 'email'])
      .where('id', '=', contactId)
      .where('location_id', '=', locationId)
      .executeTakeFirst()
    if (!contact) throw new ContactError('not_found')
    if (consent.channel === 'email' && !contact.email) {
      throw new ContactError('channel_unavailable')
    }

    const event = await transaction
      .insertInto('contact_consent_events')
      .values({
        id,
        tenant_id: tenantId,
        contact_id: contactId,
        channel: consent.channel,
        purpose: consent.purpose,
        state: consent.state,
        source: consent.source,
        policy_version: consent.policyVersion ?? null,
        evidence_reference: consent.evidenceReference ?? null,
        actor_subject: actorSubject,
      })
      .returning('recorded_at')
      .executeTakeFirstOrThrow()

    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'contact.consent_recorded',
      resourceType: 'contact_consent',
      resourceId: id,
      metadata: {
        locationId,
        channel: consent.channel,
        purpose: consent.purpose,
        state: consent.state,
        source: consent.source,
      },
    })
    return event.recorded_at
  })

  return {
    id,
    contactId,
    channel: consent.channel,
    purpose: consent.purpose,
    state: consent.state,
    source: consent.source,
    policyVersion: consent.policyVersion ?? null,
    evidenceReference: consent.evidenceReference ?? null,
    actorSubject,
    recordedAt,
  }
}