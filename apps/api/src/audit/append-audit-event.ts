import { randomUUID } from 'node:crypto'
import type { Transaction } from 'kysely'
import type { ApiDatabase } from '../db/schema.js'

export interface AuditEventInput {
  tenantId: string
  actorSubject: string
  action: string
  resourceType: string
  resourceId?: string
  metadata?: Record<string, unknown>
}

export async function appendAuditEvent(
  transaction: Transaction<ApiDatabase>,
  event: AuditEventInput,
): Promise<void> {
  await transaction
    .insertInto('audit_events')
    .values({
      id: randomUUID(),
      tenant_id: event.tenantId,
      actor_subject: event.actorSubject,
      action: event.action,
      resource_type: event.resourceType,
      resource_id: event.resourceId ?? null,
      metadata: event.metadata ?? {},
    })
    .execute()
}
