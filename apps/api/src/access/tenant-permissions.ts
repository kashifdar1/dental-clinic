import type { Permission, Role } from '@clinic-hub/shared'
import { hasPermission, RoleSchema } from '@clinic-hub/shared'
import type { Kysely } from 'kysely'
import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify'
import { z } from 'zod'
import type { ApiDatabase } from '../db/schema.js'
import { withTenant } from '../tenant/with-tenant.js'

const TenantIdSchema = z.string().uuid()
const LocationIdSchema = z.string().uuid()

export async function hasActiveTenantMembership(
  database: Kysely<ApiDatabase>,
  subject: string,
  tenantId: string,
): Promise<boolean> {
  const scopedTenantId = TenantIdSchema.parse(tenantId)
  return withTenant(database, scopedTenantId, async (transaction) => {
    const membership = await transaction
      .selectFrom('memberships')
      .select('id')
      .where('identity_subject', '=', subject)
      .where('status', '=', 'active')
      .executeTakeFirst()
    return Boolean(membership)
  })
}

export async function tenantHasPermission(
  database: Kysely<ApiDatabase>,
  input: {
    subject: string
    tenantId: string
    locationId?: string
    permission: Permission
  },
): Promise<boolean> {
  const tenantId = TenantIdSchema.parse(input.tenantId)
  const locationId = input.locationId
    ? LocationIdSchema.parse(input.locationId)
    : undefined

  return withTenant(database, tenantId, async (transaction) => {
    if (locationId) {
      const location = await transaction
        .selectFrom('locations')
        .select('id')
        .where('id', '=', locationId)
        .executeTakeFirst()
      if (!location) return false
    }

    const assignments = await transaction
      .selectFrom('memberships')
      .innerJoin('role_assignments', (join) =>
        join
          .onRef('role_assignments.membership_id', '=', 'memberships.id')
          .onRef('role_assignments.tenant_id', '=', 'memberships.tenant_id'),
      )
      .select(['role_assignments.role_key', 'role_assignments.scope', 'role_assignments.scope_location_id'])
      .where('memberships.identity_subject', '=', input.subject)
      .where('memberships.status', '=', 'active')
      .where((expression) => {
        if (!locationId) return expression('role_assignments.scope', '=', 'tenant')
        return expression.or([
          expression('role_assignments.scope', '=', 'tenant'),
          expression.and([
            expression('role_assignments.scope', '=', 'location'),
            expression('role_assignments.scope_location_id', '=', locationId),
          ]),
        ])
      })
      .execute()

    return assignments.some((assignment) => {
      const role = RoleSchema.safeParse(assignment.role_key)
      return role.success && hasPermission(role.data as Role, input.permission)
    })
  })
}

export function requireTenantPermission(
  database: Kysely<ApiDatabase>,
  permission: Permission,
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.identity) return reply.status(401).send({ error: 'unauthorized' })
    if (request.identity.realm !== 'tenant') return reply.status(403).send({ error: 'forbidden' })

    const tenantHeader = request.headers['x-tenant-id']
    const locationHeader = request.headers['x-location-id']
    if (typeof tenantHeader !== 'string') {
      return reply.status(400).send({ error: 'tenant_context_required' })
    }
    if (locationHeader !== undefined && typeof locationHeader !== 'string') {
      return reply.status(400).send({ error: 'invalid_location_context' })
    }

    let allowed: boolean
    try {
      allowed = await tenantHasPermission(database, {
        subject: request.identity.subject,
        tenantId: tenantHeader,
        locationId: locationHeader,
        permission,
      })
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'invalid_tenant_context' })
      }
      request.log.error(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'Authorization check failed',
      )
      return reply.status(503).send({ error: 'authorization_unavailable' })
    }

    if (!allowed) return reply.status(403).send({ error: 'forbidden' })
    request.tenantId = tenantHeader
    request.locationId = locationHeader
  }
}

export function requireTenantMembership(
  database: Kysely<ApiDatabase>,
): preHandlerHookHandler {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (!request.identity) return reply.status(401).send({ error: 'unauthorized' })
    if (request.identity.realm !== 'tenant') return reply.status(403).send({ error: 'forbidden' })
    const tenantId = request.headers['x-tenant-id']
    if (typeof tenantId !== 'string') {
      return reply.status(400).send({ error: 'tenant_context_required' })
    }

    try {
      if (!(await hasActiveTenantMembership(database, request.identity.subject, tenantId))) {
        return reply.status(403).send({ error: 'forbidden' })
      }
      request.tenantId = TenantIdSchema.parse(tenantId)
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: 'invalid_tenant_context' })
      }
      request.log.error(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'Tenant membership check failed',
      )
      return reply.status(503).send({ error: 'authorization_unavailable' })
    }
  }
}
