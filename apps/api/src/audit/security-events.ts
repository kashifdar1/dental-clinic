import { randomUUID } from 'node:crypto'
import type { Kysely } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'

export interface SecurityEventInput {
  eventType: string
  actorSubject?: string
  identityRealm?: 'tenant' | 'platform'
  requestId?: string
  metadata?: Record<string, unknown>
}

export async function recordSecurityEvent(
  platformDatabase: Kysely<ApiDatabase>,
  event: SecurityEventInput,
): Promise<void> {
  await platformDatabase
    .insertInto('security_events')
    .values({
      id: randomUUID(),
      event_type: event.eventType,
      actor_subject: event.actorSubject ?? null,
      identity_realm: event.identityRealm ?? null,
      request_id: event.requestId ?? null,
      metadata: event.metadata ?? {},
    })
    .execute()
}
