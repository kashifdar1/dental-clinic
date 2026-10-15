import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { sql, type Kysely } from 'kysely'
import { z } from 'zod'
import type { AuthenticatedIdentity, Role } from '@clinic-hub/shared'
import { RoleSchema } from '@clinic-hub/shared'
import type { ApiDatabase } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { assertEntitlement } from '../billing/entitlement-service.js'
import { tenantHasPermission } from '../access/tenant-permissions.js'
import { withTenant } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()
const EmailSchema = z.string().trim().email().max(254)
const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000

export type InvitationScope = 'tenant' | 'location'

export interface CreateInvitationInput {
  tenantId: string
  email: string
  role: Role
  scope: InvitationScope
  locationId?: string
}

export interface CreatedInvitation {
  id: string
  token: string
  expiresAt: Date
}

export class InvitationError extends Error {
  constructor(readonly code: 'forbidden' | 'invalid' | 'expired' | 'email_mismatch' | 'already_member') {
    super(code)
    this.name = 'InvitationError'
  }
}

function tokenHash(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export async function createInvitation(
  database: Kysely<ApiDatabase>,
  actor: AuthenticatedIdentity,
  input: CreateInvitationInput,
  now = new Date(),
): Promise<CreatedInvitation> {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const email = EmailSchema.parse(input.email).toLowerCase()
  const role = RoleSchema.parse(input.role)
  const locationId = input.locationId
    ? LocationIdSchema.parse(input.locationId)
    : undefined

  if (actor.realm !== 'tenant' || !actor.emailVerified) {
    throw new InvitationError('forbidden')
  }
  if ((input.scope === 'tenant' && locationId) || (input.scope === 'location' && !locationId)) {
    throw new InvitationError('invalid')
  }
  if (role === 'tenant_owner' && input.scope !== 'tenant') {
    throw new InvitationError('invalid')
  }
  if (
    !(await tenantHasPermission(database, {
      subject: actor.subject,
      tenantId,
      locationId,
      permission: 'member.invite',
    }))
  ) {
    throw new InvitationError('forbidden')
  }

  return withTenant(database, tenantId, async (transaction) => {
    if (role === 'tenant_owner') {
      const ownerAssignment = await transaction
        .selectFrom('memberships')
        .innerJoin('role_assignments', (join) =>
          join
            .onRef('role_assignments.membership_id', '=', 'memberships.id')
            .onRef('role_assignments.tenant_id', '=', 'memberships.tenant_id'),
        )
        .select('role_assignments.id')
        .where('memberships.identity_subject', '=', actor.subject)
        .where('memberships.status', '=', 'active')
        .where('role_assignments.role_key', '=', 'tenant_owner')
        .where('role_assignments.scope', '=', 'tenant')
        .executeTakeFirst()
      if (!ownerAssignment) throw new InvitationError('forbidden')
    }

    const existingMember = await transaction
      .selectFrom('memberships')
      .select('id')
      .where('email', '=', email)
      .where('status', '=', 'active')
      .executeTakeFirst()
    if (existingMember) throw new InvitationError('already_member')

    const existingInvite = await transaction
      .selectFrom('invitations')
      .select('id')
      .where('email', '=', email)
      .where('status', '=', 'pending')
      .executeTakeFirst()
    if (existingInvite) throw new InvitationError('invalid')
    await assertEntitlement(transaction, { tenantId, key: 'staff.seats.max', delta: 1 })

    const token = randomBytes(32).toString('base64url')
    const id = randomUUID()
    const expiresAt = new Date(now.getTime() + INVITATION_LIFETIME_MS)
    await transaction
      .insertInto('invitations')
      .values({
        id,
        tenant_id: tenantId,
        email,
        role_key: role,
        scope: input.scope,
        scope_location_id: locationId ?? null,
        invited_by_subject: actor.subject,
        token_hash: tokenHash(token),
        expires_at: expiresAt.toISOString(),
        status: 'pending',
        accepted_at: null,
      })
      .execute()

    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject: actor.subject,
      action: 'membership.invitation_created',
      resourceType: 'invitation',
      resourceId: id,
      metadata: { email, role, scope: input.scope, locationId },
    })

    return { id, token, expiresAt }
  })
}

export async function acceptInvitation(
  database: Kysely<ApiDatabase>,
  identity: AuthenticatedIdentity,
  token: string,
  now = new Date(),
): Promise<{ tenantId: string; membershipId: string }> {
  if (identity.realm !== 'tenant' || !identity.emailVerified || !identity.email) {
    throw new InvitationError('forbidden')
  }
  if (token.length < 32 || token.length > 200) throw new InvitationError('invalid')
  const digest = tokenHash(token)
  const lookup = await sql<{ tenant_id: string }>`
    SELECT clinic_hub.resolve_invitation_tenant(${digest}) AS tenant_id
  `.execute(database)
  const tenantId = lookup.rows[0]?.tenant_id
  if (!tenantId) throw new InvitationError('expired')

  return withTenant(database, tenantId, async (transaction) => {
    const invitation = await transaction
      .selectFrom('invitations')
      .select(['id', 'tenant_id', 'email', 'role_key', 'scope', 'scope_location_id'])
      .where('token_hash', '=', digest)
      .where('status', '=', 'pending')
      .where('expires_at', '>', now)
      .executeTakeFirst()
    if (!invitation) throw new InvitationError('expired')
    if (invitation.email.toLowerCase() !== identity.email!.trim().toLowerCase()) {
      throw new InvitationError('email_mismatch')
    }

    const membershipId = randomUUID()
    await transaction
      .insertInto('memberships')
      .values({
        id: membershipId,
        tenant_id: tenantId,
        identity_subject: identity.subject,
        email: invitation.email,
        display_name: invitation.email,
        status: 'active',
      })
      .execute()
    await transaction
      .insertInto('role_assignments')
      .values({
        id: randomUUID(),
        tenant_id: tenantId,
        membership_id: membershipId,
        role_key: invitation.role_key,
        scope: invitation.scope,
        scope_location_id: invitation.scope_location_id,
      })
      .execute()
    await transaction
      .updateTable('invitations')
      .set({ status: 'accepted', accepted_at: now.toISOString() })
      .where('id', '=', invitation.id)
      .execute()

    await appendAuditEvent(transaction, {
      tenantId,
      actorSubject: identity.subject,
      action: 'membership.invitation_accepted',
      resourceType: 'membership',
      resourceId: membershipId,
      metadata: { invitationId: invitation.id, role: invitation.role_key },
    })

    return { tenantId, membershipId }
  })
}
