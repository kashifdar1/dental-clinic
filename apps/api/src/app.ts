import Fastify, { type FastifyServerOptions, type preHandlerHookHandler } from 'fastify'
import cookie from '@fastify/cookie'
import swagger from '@fastify/swagger'
import type { Authenticator } from '@clinic-hub/shared'
import type { Kysely } from 'kysely'
import { requireTenantMembership, requireTenantPermission } from './access/tenant-permissions.js'
import { requirePlatformStaff } from './auth/require-platform-staff.js'
import { requireIdentity } from './auth/require-identity.js'
import { registerSessionRoutes } from './auth/session-routes.js'
import type { SessionStore } from './auth/session-store.js'
import type { ApiDatabase } from './db/schema.js'
import { InvitationError, acceptInvitation, createInvitation } from './tenancy/invitation-service.js'
import type { SecurityEventInput } from './audit/security-events.js'
import {
  TenantLifecycleError,
  createTenant,
  listTenants,
  transitionTenant,
} from './platform/tenant-service.js'
import { LocationError, createLocation, listLocations, updateLocation } from './tenancy/location-service.js'
import { z } from 'zod'
import {
  MembershipError,
  listAccessibleTenants,
  listMemberships,
  listPendingInvitations,
  revokeInvitation,
} from './tenancy/membership-service.js'

interface ApiOptions {
  checkDatabase: () => Promise<void>
  authenticator?: Authenticator
  sessionStore?: SessionStore
  sessionStores?: Partial<Record<'tenant' | 'platform', SessionStore>>
  secureCookies?: boolean
  tenantDatabase?: Kysely<ApiDatabase>
  platformDatabase?: Kysely<ApiDatabase>
  isActivePlatformStaff?: (subject: string) => Promise<boolean>
  recordSecurityEvent?: (event: SecurityEventInput) => Promise<void>
  logger?: FastifyServerOptions['logger']
}

const rejectIdentity: Authenticator = {
  async authenticate() {
    return null
  },
}

export function createApi(options: ApiOptions) {
  const app = Fastify({
    logger: options.logger ?? {
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          "req.headers['x-api-key']",
        ],
        censor: '[REDACTED]',
      },
    },
  })
  app.register(swagger, {
    openapi: {
      info: {
        title: 'Clinic Hub API',
        version: '0.1.0',
      },
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  })
  app.decorateRequest('identity', null)
  if (options.sessionStore || options.sessionStores) app.register(cookie)

  app.setErrorHandler((error, request, reply) => {
    request.log.error(
      { errorName: error instanceof Error ? error.name : 'unknown' },
      'Unhandled API error',
    )
    return reply.status(500).send({
      error: 'internal_server_error',
      requestId: request.id,
    })
  })

  app.register(async (routes) => {
    routes.get(
      '/health/live',
      {
        schema: {
          tags: ['health'],
          summary: 'Liveness check',
          response: {
            200: {
              type: 'object',
              properties: { status: { type: 'string', enum: ['ok'] } },
              required: ['status'],
            },
          },
        },
      },
      async () => ({ status: 'ok' }),
    )
    routes.get(
      '/health/ready',
      {
        schema: {
          tags: ['health'],
          summary: 'Database readiness check',
          response: {
            200: {
              type: 'object',
              properties: { status: { type: 'string', enum: ['ready'] } },
              required: ['status'],
            },
            503: {
              type: 'object',
              properties: { status: { type: 'string', enum: ['not_ready'] } },
              required: ['status'],
            },
          },
        },
      },
      async (request, reply) => {
        try {
          await options.checkDatabase()
          return { status: 'ready' }
        } catch (error) {
          request.log.warn(
            { reason: error instanceof Error ? error.name : 'unknown' },
            'Database readiness check failed',
          )
          return reply.status(503).send({ status: 'not_ready' })
        }
      },
    )
    routes.get(
      '/v1/me',
      {
        preHandler: requireIdentity(options.authenticator ?? rejectIdentity, {
          sessionStore: options.sessionStore,
          secureCookies: options.secureCookies,
        }),
        schema: {
          tags: ['identity'],
          summary: 'Return the authenticated identity',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                realm: { type: 'string', enum: ['tenant', 'platform'] },
                email: { type: 'string' },
                emailVerified: { type: 'boolean' },
                mfaVerified: { type: 'boolean' },
              },
              required: ['subject', 'realm', 'emailVerified', 'mfaVerified'],
            },
            401: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request) => ({
        subject: request.identity!.subject,
        realm: request.identity!.realm,
        email: request.identity!.email,
        emailVerified: request.identity!.emailVerified,
        mfaVerified: request.identity!.mfaVerified,
      }),
    )
    const tenantRealmGuard = requireIdentity(options.authenticator ?? rejectIdentity, {
      expectedRealm: 'tenant',
      sessionStore: options.sessionStore,
      sessionStores: options.sessionStores,
      secureCookies: options.secureCookies,
    })
    const tenantUnavailable: preHandlerHookHandler = async (_request, reply) =>
      reply.code(503).send({ error: 'authorization_unavailable' })
    const platformDatabaseUnavailable: preHandlerHookHandler = async (_request, reply) =>
      reply.code(503).send({ error: 'platform_database_unavailable' })
    routes.get(
      '/v1/tenant/me',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantMembership(options.tenantDatabase)]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Return the current authorized tenant context',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              properties: {
                realm: { type: 'string', enum: ['tenant'] },
                tenantId: { type: 'string', format: 'uuid' },
              },
              required: ['realm', 'tenantId'],
            },
            503: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request) => ({ realm: 'tenant', tenantId: request.tenantId }),
    )
    routes.get(
      '/v1/tenant/tenants',
      {
        preHandler: options.tenantDatabase ? tenantRealmGuard : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List tenants available to the authenticated identity',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  tenantId: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  roles: { type: 'array', items: { type: 'string' } },
                },
                required: ['tenantId', 'name', 'slug', 'roles'],
              },
            },
            503: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request) =>
        listAccessibleTenants(options.tenantDatabase!, request.identity!.subject),
    )
    const platformRealmGuard = requireIdentity(options.authenticator ?? rejectIdentity, {
      sessionStore: options.sessionStore,
      sessionStores: options.sessionStores,
      secureCookies: options.secureCookies,
    })
    const platformStaffGuard: preHandlerHookHandler[] = [
      platformRealmGuard,
      requirePlatformStaff(
        options.isActivePlatformStaff ?? (async () => false),
        options.recordSecurityEvent
          ? (event) =>
              options.recordSecurityEvent!({
                eventType: 'platform.authorization_denied',
                actorSubject: event.actorSubject,
                identityRealm: event.identityRealm,
                requestId: event.requestId,
                metadata: { reason: event.reason },
              })
          : undefined,
      ),
    ]
    routes.get(
      '/v1/platform/me',
      {
        preHandler: platformStaffGuard,
        schema: {
          tags: ['platform'],
          summary: 'Return the active platform staff context',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'object',
              properties: { realm: { type: 'string', enum: ['platform'] } },
              required: ['realm'],
            },
          },
        },
      },
      async () => ({ realm: 'platform' }),
    )
    routes.get(
      '/v1/platform/tenants',
      {
        preHandler: options.platformDatabase ? platformStaffGuard : platformDatabaseUnavailable,
        schema: {
          tags: ['platform'],
          summary: 'List tenants for platform operations',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  lifecycle_state: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
                required: ['id', 'name', 'slug', 'lifecycle_state', 'created_at'],
              },
            },
            503: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async () => listTenants(options.platformDatabase!),
    )
    routes.post(
      '/v1/platform/tenants',
      {
        preHandler: options.platformDatabase ? platformStaffGuard : platformDatabaseUnavailable,
        schema: {
          tags: ['platform'],
          summary: 'Provision a tenant in draft state',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 160 },
              slug: { type: 'string', minLength: 1, maxLength: 63 },
            },
            required: ['name', 'slug'],
          },
          response: {
            201: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                slug: { type: 'string' },
                lifecycleState: { type: 'string', enum: ['draft'] },
              },
              required: ['id', 'name', 'slug', 'lifecycleState'],
            },
            400: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            409: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            503: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request, reply) => {
        const body = request.body as { name: string; slug: string }
        try {
          const created = await createTenant(
            options.platformDatabase!,
            request.identity!.subject,
            body,
          )
          return reply.status(201).send(created)
        } catch (error) {
          if (error instanceof TenantLifecycleError) {
            return reply.status(error.code === 'slug_unavailable' ? 409 : 400).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/v1/tenant/locations',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantMembership(options.tenantDatabase)]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List locations visible to the active tenant member',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  tenant_id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  slug: { type: 'string' },
                  timezone: { type: 'string' },
                },
                required: ['id', 'tenant_id', 'name', 'slug', 'timezone'],
              },
            },
          },
        },
      },
      async (request) => listLocations(options.tenantDatabase!, request.tenantId!),
    )
    routes.post(
      '/v1/tenant/locations',
      {
        preHandler: options.tenantDatabase
          ? [
              tenantRealmGuard,
              requireTenantPermission(options.tenantDatabase, 'location.manage'),
            ]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Create a location for the active tenant',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 160 },
              slug: { type: 'string', minLength: 1, maxLength: 63 },
              timezone: { type: 'string', minLength: 1 },
            },
            required: ['name', 'slug', 'timezone'],
          },
          response: {
            201: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                tenantId: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                slug: { type: 'string' },
                timezone: { type: 'string' },
              },
              required: ['id', 'tenantId', 'name', 'slug', 'timezone'],
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            403: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            503: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        try {
          const body = request.body as { name: string; slug: string; timezone: string }
          const created = await createLocation(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, ...body },
          )
          return reply.status(201).send(created)
        } catch (error) {
          if (error instanceof z.ZodError) {
            return reply.status(400).send({ error: 'invalid_location' })
          }
          if (error instanceof LocationError) {
            return reply.status(409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.patch(
      '/v1/tenant/locations/:locationId',
      {
        preHandler: options.tenantDatabase
          ? [
              tenantRealmGuard,
              requireTenantPermission(options.tenantDatabase, 'location.manage'),
            ]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Update a location in the active tenant',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { locationId: { type: 'string', format: 'uuid' } },
            required: ['locationId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 2, maxLength: 160 },
              slug: { type: 'string', minLength: 1, maxLength: 63 },
              timezone: { type: 'string', minLength: 1 },
            },
            required: ['name', 'slug', 'timezone'],
          },
        },
      },
      async (request, reply) => {
        const { locationId } = request.params as { locationId: string }
        if (request.locationId !== locationId) {
          return reply.status(400).send({ error: 'location_context_mismatch' })
        }
        try {
          const body = request.body as { name: string; slug: string; timezone: string }
          return await updateLocation(options.tenantDatabase!, request.identity!.subject, {
            tenantId: request.tenantId!,
            locationId,
            ...body,
          })
        } catch (error) {
          if (error instanceof z.ZodError) {
            return reply.status(400).send({ error: 'invalid_location' })
          }
          if (error instanceof LocationError) {
            return reply.status(error.code === 'not_found' ? 404 : 409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.patch(
      '/v1/platform/tenants/:tenantId/lifecycle',
      {
        preHandler: options.platformDatabase
          ? platformStaffGuard
          : async (_request, reply) => reply.code(503).send({ error: 'platform_database_unavailable' }),
        schema: {
          tags: ['platform'],
          summary: 'Change tenant lifecycle state',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { tenantId: { type: 'string', format: 'uuid' } },
            required: ['tenantId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              lifecycleState: {
                type: 'string',
                enum: ['draft', 'trial', 'active', 'past_due', 'suspended', 'closed'],
              },
            },
            required: ['lifecycleState'],
          },
        },
      },
      async (request, reply) => {
        const { tenantId } = request.params as { tenantId: string }
        const { lifecycleState } = request.body as {
          lifecycleState: 'draft' | 'trial' | 'active' | 'past_due' | 'suspended' | 'closed'
        }
        try {
          return await transitionTenant(
            options.platformDatabase!,
            request.identity!.subject,
            tenantId,
            lifecycleState,
          )
        } catch (error) {
          if (error instanceof TenantLifecycleError) {
            const status = error.code === 'not_found' ? 404 : error.code === 'invalid_transition' ? 409 : 400
            return reply.status(status).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/v1/platform/audit-events',
      {
        preHandler: options.platformDatabase ? platformStaffGuard : platformDatabaseUnavailable,
        schema: {
          tags: ['platform'],
          summary: 'Read platform and tenant audit events',
          security: [{ bearerAuth: [] }],
          querystring: {
            type: 'object',
            additionalProperties: false,
            properties: {
              tenantId: { type: 'string', format: 'uuid' },
              limit: { type: 'integer', minimum: 1, maximum: 100, default: 50 },
            },
          },
        },
      },
      async (request) => {
        const query = request.query as { tenantId?: string; limit?: number }
        const limit = query.limit ?? 50
        const tenantEventsQuery = options.platformDatabase!
          .selectFrom('audit_events')
          .leftJoin('tenants', 'tenants.id', 'audit_events.tenant_id')
          .select([
            'audit_events.id',
            'audit_events.tenant_id as tenantId',
            'tenants.name as tenantName',
            'audit_events.actor_subject as actorSubject',
            'audit_events.action',
            'audit_events.resource_type as resourceType',
            'audit_events.resource_id as resourceId',
            'audit_events.metadata',
            'audit_events.occurred_at as occurredAt',
          ])
          .orderBy('audit_events.occurred_at', 'desc')
          .limit(limit)
        const tenantEvents = query.tenantId
          ? await tenantEventsQuery.where('audit_events.tenant_id', '=', query.tenantId).execute()
          : await tenantEventsQuery.execute()
        const securityEvents = await options.platformDatabase!
          .selectFrom('security_events')
          .select([
            'id',
            'event_type as eventType',
            'actor_subject as actorSubject',
            'identity_realm as identityRealm',
            'request_id as requestId',
            'metadata',
            'occurred_at as occurredAt',
          ])
          .orderBy('occurred_at', 'desc')
          .limit(limit)
          .execute()
        return { tenantEvents, securityEvents }
      },
    )
    if (options.sessionStore || options.sessionStores) {
      await registerSessionRoutes(routes, {
        authenticator: options.authenticator ?? rejectIdentity,
        stores: {
          ...options.sessionStores,
          tenant: options.sessionStores?.tenant ?? options.sessionStore,
        },
        secureCookies: options.secureCookies ?? false,
      })
    }
    routes.post(
      '/v1/tenant/invitations',
      {
        preHandler:
          options.tenantDatabase && options.sessionStore
            ? [
                requireIdentity(options.authenticator ?? rejectIdentity, {
                  expectedRealm: 'tenant',
                  sessionStore: options.sessionStore,
                  sessionStores: options.sessionStores,
                  secureCookies: options.secureCookies,
                }),
                requireTenantMembership(options.tenantDatabase),
              ]
            : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Invite a member to the authenticated tenant',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              email: { type: 'string', format: 'email', maxLength: 254 },
              role: {
                type: 'string',
                enum: [
                  'tenant_owner',
                  'tenant_admin',
                  'location_manager',
                  'receptionist',
                  'practitioner',
                  'billing_admin',
                  'content_editor',
                ],
              },
              scope: { type: 'string', enum: ['tenant', 'location'] },
              locationId: { type: 'string', format: 'uuid' },
            },
            required: ['email', 'role', 'scope'],
          },
          response: {
            201: {
              type: 'object',
              properties: {
                invitationId: { type: 'string', format: 'uuid' },
                invitationToken: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
              required: ['invitationId', 'invitationToken', 'expiresAt'],
            },
            400: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            403: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            503: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request, reply) => {
        try {
          const body = request.body as {
            email: string
            role: string
            scope: 'tenant' | 'location'
            locationId?: string
          }
          const created = await createInvitation(
            options.tenantDatabase!,
            request.identity!,
            {
              tenantId: request.tenantId!,
              email: body.email,
              role: body.role as import('@clinic-hub/shared').Role,
              scope: body.scope,
              locationId: body.locationId,
            },
          )
          return reply.status(201).send({
            invitationId: created.id,
            invitationToken: created.token,
            expiresAt: created.expiresAt.toISOString(),
          })
        } catch (error) {
          if (error instanceof InvitationError) {
            const status = error.code === 'forbidden' ? 403 : 400
            return reply.status(status).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/v1/tenant/memberships',
      {
        preHandler: options.tenantDatabase
          ? [
              tenantRealmGuard,
              requireTenantPermission(options.tenantDatabase, 'member.invite'),
            ]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List memberships and scoped roles for the active tenant',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  membershipId: { type: 'string', format: 'uuid' },
                  email: { type: 'string', format: 'email' },
                  displayName: { type: 'string' },
                  status: { type: 'string', enum: ['invited', 'active', 'disabled'] },
                  role: { type: 'string' },
                  scope: { type: 'string' },
                  locationId: { type: 'string', format: 'uuid' },
                },
                required: ['membershipId', 'email', 'displayName', 'status'],
              },
            },
          },
        },
      },
      async (request) => listMemberships(options.tenantDatabase!, request.tenantId!),
    )
    routes.get(
      '/v1/tenant/invitations',
      {
        preHandler: options.tenantDatabase
          ? [
              tenantRealmGuard,
              requireTenantPermission(options.tenantDatabase, 'member.invite'),
            ]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List pending invitations for the active tenant',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  email: { type: 'string', format: 'email' },
                  role_key: { type: 'string' },
                  scope: { type: 'string' },
                  scope_location_id: { type: 'string', format: 'uuid' },
                  invited_by_subject: { type: 'string' },
                  expires_at: { type: 'string', format: 'date-time' },
                  created_at: { type: 'string', format: 'date-time' },
                },
                required: ['id', 'email', 'role_key', 'scope', 'invited_by_subject', 'expires_at', 'created_at'],
              },
            },
          },
        },
      },
      async (request) => listPendingInvitations(options.tenantDatabase!, request.tenantId!),
    )
    routes.delete(
      '/v1/tenant/invitations/:invitationId',
      {
        preHandler: options.tenantDatabase
          ? [
              tenantRealmGuard,
              requireTenantPermission(options.tenantDatabase, 'member.invite'),
            ]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Revoke a pending invitation',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { invitationId: { type: 'string', format: 'uuid' } },
            required: ['invitationId'],
          },
          response: {
            204: { type: 'null' },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        const { invitationId } = request.params as { invitationId: string }
        try {
          await revokeInvitation(
            options.tenantDatabase!,
            request.identity!.subject,
            request.tenantId!,
            invitationId,
          )
          return reply.status(204).send()
        } catch (error) {
          if (error instanceof MembershipError) {
            return reply.status(404).send({ error: error.code })
          }
          if (error instanceof z.ZodError) {
            return reply.status(400).send({ error: 'invalid_invitation_id' })
          }
          throw error
        }
      },
    )
    routes.post(
      '/v1/invitations/accept',
      {
        preHandler: options.tenantDatabase
          ? requireIdentity(options.authenticator ?? rejectIdentity, {
              expectedRealm: 'tenant',
              sessionStore: options.sessionStore,
              sessionStores: options.sessionStores,
              secureCookies: options.secureCookies,
            })
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Accept a verified tenant invitation',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { token: { type: 'string', minLength: 32, maxLength: 200 } },
            required: ['token'],
          },
          response: {
            200: {
              type: 'object',
              properties: {
                tenantId: { type: 'string', format: 'uuid' },
                membershipId: { type: 'string', format: 'uuid' },
              },
              required: ['tenantId', 'membershipId'],
            },
            400: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            403: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            503: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request, reply) => {
        try {
          const body = request.body as { token: string }
          return await acceptInvitation(options.tenantDatabase!, request.identity!, body.token)
        } catch (error) {
          if (error instanceof InvitationError) {
            const status = error.code === 'forbidden' ? 403 : 400
            return reply.status(status).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/openapi.json',
      { schema: { hide: true } },
      async () => routes.swagger(),
    )
  })

  return app
}
