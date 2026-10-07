import Fastify, { type FastifyServerOptions, type preHandlerHookHandler } from 'fastify'
import cookie from '@fastify/cookie'
import swagger from '@fastify/swagger'
import type { Authenticator } from '@clinic-hub/shared'
import type { Kysely } from 'kysely'
import { requireTenantMembership } from './access/tenant-permissions.js'
import { requirePlatformStaff } from './auth/require-platform-staff.js'
import { requireIdentity } from './auth/require-identity.js'
import { registerSessionRoutes } from './auth/session-routes.js'
import type { SessionStore } from './auth/session-store.js'
import type { ApiDatabase } from './db/schema.js'
import { InvitationError, acceptInvitation, createInvitation } from './tenancy/invitation-service.js'
import type { SecurityEventInput } from './audit/security-events.js'

interface ApiOptions {
  checkDatabase: () => Promise<void>
  authenticator?: Authenticator
  sessionStore?: SessionStore
  sessionStores?: Partial<Record<'tenant' | 'platform', SessionStore>>
  secureCookies?: boolean
  tenantDatabase?: Kysely<ApiDatabase>
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
    const platformRealmGuard = requireIdentity(options.authenticator ?? rejectIdentity, {
      sessionStore: options.sessionStore,
      sessionStores: options.sessionStores,
      secureCookies: options.secureCookies,
    })
    routes.get(
      '/v1/platform/me',
      {
        preHandler: [
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
        ],
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
