import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'
import { appendAuditEvent } from '../audit/append-audit-event.js'

const SUPPORT_SESSION_MS = 15 * 60 * 1000

export class SupportSessionError extends Error {
  constructor(readonly code: 'forbidden' | 'not_found' | 'expired' | 'invalid') {
    super(code)
    this.name = 'SupportSessionError'
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

export async function createSupportSession(
  database: Kysely<ApiDatabase>,
  actor: { subject: string; realm: 'tenant' | 'platform'; mfaVerified: boolean },
  input: { tenantId: string; reason: string },
  now = new Date(),
) {
  if (actor.realm !== 'platform' || !actor.mfaVerified) {
    throw new SupportSessionError('forbidden')
  }
  const reason = input.reason.trim()
  if (reason.length < 20 || reason.length > 500) throw new SupportSessionError('invalid')

  const tenant = await database
    .selectFrom('tenants')
    .select(['id', 'name'])
    .where('id', '=', input.tenantId)
    .executeTakeFirst()
  if (!tenant) throw new SupportSessionError('not_found')

  const id = randomUUID()
  const token = randomBytes(32).toString('base64url')
  const expiresAt = new Date(now.getTime() + SUPPORT_SESSION_MS)
  await database.transaction().execute(async (transaction) => {
    await transaction
      .insertInto('support_sessions')
      .values({
        id,
        tenant_id: tenant.id,
        platform_subject: actor.subject,
        reason,
        token_hash: hash(token),
        expires_at: expiresAt.toISOString(),
        revoked_at: null,
      })
      .execute()
    await appendAuditEvent(transaction, {
      tenantId: tenant.id,
      actorSubject: actor.subject,
      action: 'platform.support_session_started',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: { supportSessionId: id, expiresAt: expiresAt.toISOString(), reason },
    })
    await transaction
      .insertInto('security_events')
      .values({
        id: randomUUID(),
        event_type: 'platform.support_session_started',
        actor_subject: actor.subject,
        identity_realm: actor.realm,
        request_id: null,
        metadata: { supportSessionId: id, tenantId: tenant.id, reason },
      })
      .execute()
  })

  return { id, token, tenantId: tenant.id, tenantName: tenant.name, expiresAt }
}

export async function readSupportSnapshot(
  database: Kysely<ApiDatabase>,
  actor: { subject: string; realm: 'tenant' | 'platform'; mfaVerified: boolean },
  input: { supportSessionId: string; token: string },
  now = new Date(),
) {
  if (actor.realm !== 'platform' || !actor.mfaVerified) {
    throw new SupportSessionError('forbidden')
  }
  const session = await database
    .selectFrom('support_sessions')
    .select(['id', 'tenant_id', 'platform_subject', 'token_hash', 'expires_at', 'revoked_at'])
    .where('id', '=', input.supportSessionId)
    .executeTakeFirst()
  if (!session || session.platform_subject !== actor.subject) {
    throw new SupportSessionError('not_found')
  }
  if (session.revoked_at || session.expires_at <= now) throw new SupportSessionError('expired')

  const suppliedHash = Buffer.from(hash(input.token), 'hex')
  const expectedHash = Buffer.from(session.token_hash, 'hex')
  if (suppliedHash.length !== expectedHash.length || !timingSafeEqual(suppliedHash, expectedHash)) {
    throw new SupportSessionError('forbidden')
  }

  return database.transaction().execute(async (transaction) => {
    const tenant = await transaction
      .selectFrom('tenants')
      .select(['id', 'name', 'slug', 'lifecycle_state'])
      .where('id', '=', session.tenant_id)
      .executeTakeFirst()
    if (!tenant) throw new SupportSessionError('not_found')
    const locations = await transaction
      .selectFrom('locations')
      .select(['id', 'name', 'slug', 'timezone'])
      .where('tenant_id', '=', tenant.id)
      .orderBy('name')
      .execute()
    const memberships = await transaction
      .selectFrom('memberships')
      .leftJoin('role_assignments', (join) =>
        join
          .onRef('role_assignments.tenant_id', '=', 'memberships.tenant_id')
          .onRef('role_assignments.membership_id', '=', 'memberships.id'),
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
      .where('memberships.tenant_id', '=', tenant.id)
      .orderBy('memberships.email')
      .execute()

    await appendAuditEvent(transaction, {
      tenantId: tenant.id,
      actorSubject: actor.subject,
      action: 'platform.support_session_viewed',
      resourceType: 'tenant',
      resourceId: tenant.id,
      metadata: { supportSessionId: session.id },
    })
    await transaction
      .insertInto('security_events')
      .values({
        id: randomUUID(),
        event_type: 'platform.support_session_viewed',
        actor_subject: actor.subject,
        identity_realm: actor.realm,
        request_id: null,
        metadata: { supportSessionId: session.id, tenantId: tenant.id },
      })
      .execute()

    return { tenant, locations, memberships, expiresAt: session.expires_at }
  })
}

export async function revokeSupportSession(
  database: Kysely<ApiDatabase>,
  actor: { subject: string; realm: 'tenant' | 'platform'; mfaVerified: boolean },
  supportSessionId: string,
  now = new Date(),
): Promise<void> {
  if (actor.realm !== 'platform' || !actor.mfaVerified) {
    throw new SupportSessionError('forbidden')
  }
  const session = await database
    .selectFrom('support_sessions')
    .select(['id', 'tenant_id', 'platform_subject', 'revoked_at'])
    .where('id', '=', supportSessionId)
    .executeTakeFirst()
  if (!session || session.platform_subject !== actor.subject) {
    throw new SupportSessionError('not_found')
  }
  if (session.revoked_at) return

  await database.transaction().execute(async (transaction) => {
    await transaction
      .updateTable('support_sessions')
      .set({ revoked_at: now.toISOString() })
      .where('id', '=', session.id)
      .execute()
    await appendAuditEvent(transaction, {
      tenantId: session.tenant_id,
      actorSubject: actor.subject,
      action: 'platform.support_session_ended',
      resourceType: 'tenant',
      resourceId: session.tenant_id,
      metadata: { supportSessionId: session.id },
    })
    await transaction
      .insertInto('security_events')
      .values({
        id: randomUUID(),
        event_type: 'platform.support_session_ended',
        actor_subject: actor.subject,
        identity_realm: actor.realm,
        request_id: null,
        metadata: { supportSessionId: session.id, tenantId: session.tenant_id },
      })
      .execute()
  })
}
