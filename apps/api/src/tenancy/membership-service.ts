import { z } from 'zod'
import { sql, type Kysely } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'
import { withIdentity } from '../auth/with-identity.js'
import { withTenant } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const InvitationIdSchema = z.string().uuid()

export class MembershipError extends Error {
  constructor(readonly code: 'not_found') {
    super(code)
    this.name = 'MembershipError'
  }
}

export async function listAccessibleTenants(database: Kysely<ApiDatabase>, subject: string) {
  return withIdentity(database, subject, async (transaction) => {
    const result = await sql<{
      tenantId: string
      name: string
      slug: string
      roles: string[]
    }>`
      SELECT tenants.id AS "tenantId",
             tenants.name AS name,
             tenants.slug AS slug,
             COALESCE(array_agg(DISTINCT role_assignments.role_key)
               FILTER (WHERE role_assignments.role_key IS NOT NULL), ARRAY[]::text[]) AS roles
      FROM clinic_hub.memberships AS memberships
      JOIN clinic_hub.tenants AS tenants ON tenants.id = memberships.tenant_id
      LEFT JOIN clinic_hub.role_assignments AS role_assignments
        ON role_assignments.tenant_id = memberships.tenant_id
        AND role_assignments.membership_id = memberships.id
      WHERE memberships.status = 'active'
      GROUP BY tenants.id, tenants.name, tenants.slug
      ORDER BY tenants.name
    `.execute(transaction)
    return result.rows
  })
}

export async function listMemberships(database: Kysely<ApiDatabase>, tenantId: string) {
  const id = TenantIdSchema.parse(tenantId)
  return withTenant(database, id, (transaction) =>
    transaction
      .selectFrom('memberships')
      .leftJoin('role_assignments', (join) =>
        join
          .onRef('role_assignments.membership_id', '=', 'memberships.id')
          .onRef('role_assignments.tenant_id', '=', 'memberships.tenant_id'),
      )
      .select([
        'memberships.id as membershipId',
        'memberships.email as email',
        'memberships.display_name as displayName',
        'memberships.status as status',
        'role_assignments.role_key as role',
        'role_assignments.scope as scope',
        'role_assignments.scope_location_id as locationId',
      ])
      .where('memberships.tenant_id', '=', id)
      .orderBy('memberships.created_at', 'asc')
      .execute(),
  )
}

export async function listPendingInvitations(database: Kysely<ApiDatabase>, tenantId: string) {
  const id = TenantIdSchema.parse(tenantId)
  return withTenant(database, id, (transaction) =>
    transaction
      .selectFrom('invitations')
      .select(['id', 'email', 'role_key', 'scope', 'scope_location_id', 'invited_by_subject', 'expires_at', 'created_at'])
      .where('tenant_id', '=', id)
      .where('status', '=', 'pending')
      .orderBy('created_at', 'desc')
      .execute(),
  )
}

export async function revokeInvitation(
  database: Kysely<ApiDatabase>,
  actorSubject: string,
  tenantId: string,
  invitationId: string,
): Promise<void> {
  const id = TenantIdSchema.parse(tenantId)
  const invitation = InvitationIdSchema.parse(invitationId)
  await withTenant(database, id, async (transaction) => {
    const existing = await transaction
      .selectFrom('invitations')
      .select(['id', 'email'])
      .where('tenant_id', '=', id)
      .where('id', '=', invitation)
      .where('status', '=', 'pending')
      .executeTakeFirst()
    if (!existing) throw new MembershipError('not_found')

    await transaction
      .updateTable('invitations')
      .set({ status: 'revoked' })
      .where('tenant_id', '=', id)
      .where('id', '=', invitation)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId: id,
      actorSubject,
      action: 'membership.invitation_revoked',
      resourceType: 'invitation',
      resourceId: invitation,
      metadata: { email: existing.email },
    })
  })
}
