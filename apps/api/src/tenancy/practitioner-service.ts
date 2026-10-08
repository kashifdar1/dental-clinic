import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import type { Kysely } from 'kysely'
import type {
  ApiDatabase,
  PractitionerAssignmentStatus,
  PractitionerPublicationState,
  PractitionerVerificationStatus,
} from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { withTenantLocation } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const PractitionerIdSchema = z.string().uuid()
const DisplayNameSchema = z.string().trim().min(1).max(160)
const RegistrationAuthoritySchema = z.string().trim().min(1).max(80).transform((value) => value.toUpperCase())
const RegistrationNumberSchema = z.string().trim().min(1).max(80)
const EvidenceReferenceSchema = z.string().trim().regex(/^[A-Za-z0-9._:-]{1,128}$/)

export class PractitionerError extends Error {
  constructor(readonly code:
    | 'not_found'
    | 'already_assigned'
    | 'registration_unavailable'
    | 'not_verified'
    | 'evidence_required'
    | 'invalid_publication_state'
  ) {
    super(code)
    this.name = 'PractitionerError'
  }
}

export async function listPractitioners(
  database: Kysely<ApiDatabase>,
  tenantId: string,
  locationId: string,
) {
  const scopedTenantId = TenantIdSchema.parse(tenantId)
  const scopedLocationId = LocationIdSchema.parse(locationId)
  return withTenantLocation(database, scopedTenantId, scopedLocationId, (transaction) =>
    transaction
      .selectFrom('practitioner_locations as assignment')
      .innerJoin('practitioners as practitioner', (join) =>
        join
          .onRef('practitioner.tenant_id', '=', 'assignment.tenant_id')
          .onRef('practitioner.id', '=', 'assignment.practitioner_id'),
      )
      .select([
        'practitioner.id as id',
        'practitioner.display_name as displayName',
        'practitioner.registration_authority as registrationAuthority',
        'practitioner.registration_number as registrationNumber',
        'assignment.verification_status as verificationStatus',
        'assignment.id as assignmentId',
        'assignment.location_id as locationId',
        'assignment.status as assignmentStatus',
        'assignment.publication_state as publicationState',
      ])
      .where('assignment.tenant_id', '=', scopedTenantId)
      .where('assignment.location_id', '=', scopedLocationId)
      .orderBy('practitioner.display_name', 'asc')
      .execute(),
  )
}

export async function createPractitioner(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    displayName: string
    registrationAuthority: string
    registrationNumber: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const displayName = DisplayNameSchema.parse(input.displayName)
  const registrationAuthority = RegistrationAuthoritySchema.parse(input.registrationAuthority)
  const registrationNumber = RegistrationNumberSchema.parse(input.registrationNumber)
  const practitionerId = randomUUID()
  const assignmentId = randomUUID()

  try {
    await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      await transaction
        .insertInto('practitioner_locations')
        .values({
          id: assignmentId,
          tenant_id: tenantId,
          practitioner_id: practitionerId,
          location_id: locationId,
          status: 'active',
          verification_status: 'unverified',
          verified_at: null,
          verified_by_subject: null,
          publication_state: 'draft',
        })
        .execute()
      await transaction
        .insertInto('practitioners')
        .values({
          id: practitionerId,
          tenant_id: tenantId,
          display_name: displayName,
          registration_authority: registrationAuthority,
          registration_number: registrationNumber,
        })
        .execute()
      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'practitioner.created',
        resourceType: 'practitioner',
        resourceId: practitionerId,
        metadata: { locationId, registrationAuthority },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new PractitionerError('registration_unavailable')
    }
    throw error
  }

  return {
    id: practitionerId,
    tenantId,
    displayName,
    registrationAuthority,
    registrationNumber,
    verificationStatus: 'unverified' as const,
    assignment: {
      id: assignmentId,
      locationId,
      status: 'active' as const,
      publicationState: 'draft' as const,
    },
  }
}

export async function assignPractitionerToLocation(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: { tenantId: string; locationId: string; practitionerId: string },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const assignmentId = randomUUID()

  try {
    await withTenantLocation(database, tenantId, locationId, async (transaction) => {
      await transaction
        .insertInto('practitioner_locations')
        .values({
          id: assignmentId,
          tenant_id: tenantId,
          practitioner_id: practitionerId,
          location_id: locationId,
          status: 'active',
          verification_status: 'unverified',
          verified_at: null,
          verified_by_subject: null,
          publication_state: 'draft',
        })
        .execute()
      const practitioner = await transaction
        .selectFrom('practitioners')
        .select('id')
        .where('tenant_id', '=', tenantId)
        .where('id', '=', practitionerId)
        .executeTakeFirst()
      if (!practitioner) throw new PractitionerError('not_found')

      await appendAuditEvent(transaction, {
        tenantId,
        actorSubject,
        action: 'practitioner.location_assigned',
        resourceType: 'practitioner',
        resourceId: practitionerId,
        metadata: { locationId, assignmentId },
      })
    })
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new PractitionerError('already_assigned')
    }
    throw error
  }

  return {
    id: assignmentId,
    practitionerId,
    tenantId,
    locationId,
    status: 'active' as const,
    verificationStatus: 'unverified' as const,
    publicationState: 'draft' as const,
  }
}

export async function updatePractitionerVerification(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    practitionerId: string
    verificationStatus: Exclude<PractitionerVerificationStatus, 'unverified'>
    evidenceReference?: string
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const verificationStatus = z.enum(['pending', 'verified', 'rejected']).parse(input.verificationStatus)
  const evidenceReference = input.evidenceReference === undefined
    ? null
    : EvidenceReferenceSchema.parse(input.evidenceReference)
  if (verificationStatus === 'verified' && !evidenceReference) {
    throw new PractitionerError('evidence_required')
  }

  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const assignment = await transaction
      .selectFrom('practitioner_locations')
      .select(['id', 'verification_status', 'publication_state'])
      .where('tenant_id', '=', tenantId)
      .where('practitioner_id', '=', practitionerId)
      .where('location_id', '=', locationId)
      .executeTakeFirst()
    if (!assignment) throw new PractitionerError('not_found')

    const now = new Date().toISOString()
    await transaction
      .updateTable('practitioner_locations')
      .set({
        verification_status: verificationStatus,
        verified_at: verificationStatus === 'verified' ? now : null,
        verified_by_subject: verificationStatus === 'verified' ? actorSubject : null,
        publication_state: verificationStatus === 'verified'
          ? assignment.publication_state
          : assignment.publication_state === 'published'
            ? 'unpublished'
            : assignment.publication_state,
        updated_at: now,
      })
      .where('tenant_id', '=', tenantId)
      .where('practitioner_id', '=', practitionerId)
      .where('location_id', '=', locationId)
      .execute()

    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'practitioner.verification_changed',
      resourceType: 'practitioner',
      resourceId: practitionerId,
      metadata: {
        locationId,
        previousStatus: assignment.verification_status,
        verificationStatus,
        evidenceReference,
      },
    })

    return { id: practitionerId, verificationStatus }
  })
}

export async function updatePractitionerLocation(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  input: {
    tenantId: string
    locationId: string
    practitionerId: string
    status: PractitionerAssignmentStatus
    publicationState: PractitionerPublicationState
  },
) {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = LocationIdSchema.parse(input.locationId)
  const practitionerId = PractitionerIdSchema.parse(input.practitionerId)
  const status = z.enum(['active', 'inactive']).parse(input.status)
  const publicationState = z.enum(['draft', 'published', 'unpublished']).parse(input.publicationState)

  return withTenantLocation(database, tenantId, locationId, async (transaction) => {
    const assignment = await transaction
      .selectFrom('practitioner_locations')
      .select(['id', 'verification_status'])
      .where('tenant_id', '=', tenantId)
      .where('practitioner_id', '=', practitionerId)
      .where('location_id', '=', locationId)
      .executeTakeFirst()
    if (!assignment) throw new PractitionerError('not_found')
    if (publicationState === 'published' && assignment.verification_status !== 'verified') {
      throw new PractitionerError('not_verified')
    }
    if (publicationState === 'published' && status !== 'active') {
      throw new PractitionerError('invalid_publication_state')
    }

    await transaction
      .updateTable('practitioner_locations')
      .set({ status, publication_state: publicationState, updated_at: new Date().toISOString() })
      .where('tenant_id', '=', tenantId)
      .where('practitioner_id', '=', practitionerId)
      .where('location_id', '=', locationId)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject,
      action: 'practitioner.location_updated',
      resourceType: 'practitioner',
      resourceId: practitionerId,
      metadata: { locationId, status, publicationState },
    })
    return { id: practitionerId, locationId, status, publicationState }
  })
}