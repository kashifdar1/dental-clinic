import Fastify, { type FastifyServerOptions, type preHandlerHookHandler } from 'fastify'
import cookie from '@fastify/cookie'
import swagger from '@fastify/swagger'
import { API_CONTRACT_VERSION, type Authenticator } from '@clinic-hub/shared'
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
import {
  SupportSessionError,
  createSupportSession,
  readSupportSnapshot,
  revokeSupportSession,
} from './platform/support-session-service.js'
import { LocationError, createLocation, listLocations, updateLocation } from './tenancy/location-service.js'
import {
  ContactError,
  createContact,
  listContactConsentEvents,
  listContacts,
  recordContactConsent,
} from './tenancy/contact-service.js'
import {
  PractitionerError,
  assignPractitionerToLocation,
  createPractitioner,
  listPractitioners,
  updatePractitionerLocation,
  updatePractitionerVerification,
} from './tenancy/practitioner-service.js'
import {
  CatalogError,
  assignPractitionerToService,
  createLocationOffering,
  createService,
  createServiceCategory,
  listLocationCatalog,
  updateLocationOffering,
  updatePractitionerServiceStatus,
} from './tenancy/catalog-service.js'
import { registerBillingRoutes } from './billing/billing-routes.js'
import { EntitlementError } from './billing/entitlement-service.js'
import { registerSchedulingRoutes } from './tenancy/scheduling-routes.js'
import { registerPractitionerCsvRoutes } from './tenancy/practitioner-csv-routes.js'
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
        version: API_CONTRACT_VERSION,
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
    registerSchedulingRoutes(routes, {
      tenantDatabase: options.tenantDatabase,
      tenantRealmGuard,
      tenantUnavailable,
    })
    registerPractitionerCsvRoutes(routes, {
      tenantDatabase: options.tenantDatabase,
      tenantRealmGuard,
      tenantUnavailable,
    })
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
    registerBillingRoutes(routes, {
      tenantDatabase: options.tenantDatabase,
      platformDatabase: options.platformDatabase,
      tenantRealmGuard,
      tenantUnavailable,
      platformStaffGuard,
      platformDatabaseUnavailable,
    })
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
          if (error instanceof LocationError || error instanceof EntitlementError) {
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
    routes.get(
      '/v1/tenant/contacts',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'contact.read')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List minimal contacts at the active location',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  tenantId: { type: 'string', format: 'uuid' },
                  locationId: { type: 'string', format: 'uuid' },
                  displayName: { type: 'string' },
                  phoneE164: { type: 'string' },
                  email: { type: ['string', 'null'] },
                  preferredLanguage: { type: ['string', 'null'] },
                  externalPatientRef: { type: ['string', 'null'] },
                  createdAt: { type: 'string', format: 'date-time' },
                },
                required: [
                  'id', 'tenantId', 'locationId', 'displayName', 'phoneE164',
                  'email', 'preferredLanguage', 'externalPatientRef', 'createdAt',
                ],
              },
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        return listContacts(options.tenantDatabase!, request.tenantId!, request.locationId)
      },
    )
    routes.post(
      '/v1/tenant/contacts',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'contact.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Create a minimal contact at the active location',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              displayName: { type: 'string', minLength: 1, maxLength: 160 },
              phoneE164: { type: 'string', pattern: '^\\+[1-9][0-9]{7,14}$' },
              email: { type: 'string', format: 'email', maxLength: 254 },
              preferredLanguage: { type: 'string', minLength: 2, maxLength: 35 },
              externalPatientRef: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
            },
            required: ['displayName', 'phoneE164'],
          },
          response: {
            201: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                tenantId: { type: 'string', format: 'uuid' },
                locationId: { type: 'string', format: 'uuid' },
                displayName: { type: 'string' },
                phoneE164: { type: 'string' },
                email: { type: ['string', 'null'] },
                preferredLanguage: { type: ['string', 'null'] },
                externalPatientRef: { type: ['string', 'null'] },
              },
              required: [
                'id', 'tenantId', 'locationId', 'displayName', 'phoneE164',
                'email', 'preferredLanguage', 'externalPatientRef',
              ],
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const body = request.body as {
            displayName: string
            phoneE164: string
            email?: string
            preferredLanguage?: string
            externalPatientRef?: string
          }
          const created = await createContact(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, ...body },
          )
          return reply.status(201).send(created)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_contact' })
          throw error
        }
      },
    )
    routes.get(
      '/v1/tenant/contacts/:contactId/consents',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'contact.read')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List immutable consent evidence for a location contact',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { contactId: { type: 'string', format: 'uuid' } },
            required: ['contactId'],
          },
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  channel: { type: 'string', enum: ['email', 'sms', 'whatsapp'] },
                  purpose: { type: 'string', enum: ['appointment_updates', 'marketing'] },
                  state: { type: 'string', enum: ['granted', 'withdrawn'] },
                  source: { type: 'string', enum: ['web_form', 'paper', 'verbal', 'staff_entry', 'import'] },
                  policyVersion: { type: ['string', 'null'] },
                  evidenceReference: { type: ['string', 'null'] },
                  actorSubject: { type: 'string' },
                  recordedAt: { type: 'string', format: 'date-time' },
                },
                required: [
                  'id', 'channel', 'purpose', 'state', 'source', 'policyVersion',
                  'evidenceReference', 'actorSubject', 'recordedAt',
                ],
              },
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { contactId } = request.params as { contactId: string }
          return await listContactConsentEvents(options.tenantDatabase!, {
            tenantId: request.tenantId!,
            locationId: request.locationId,
            contactId,
          })
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_contact_id' })
          if (error instanceof ContactError) return reply.status(404).send({ error: error.code })
          throw error
        }
      },
    )
    routes.post(
      '/v1/tenant/contacts/:contactId/consents',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'contact.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Append consent evidence for a contact communication channel',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { contactId: { type: 'string', format: 'uuid' } },
            required: ['contactId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              channel: { type: 'string', enum: ['email', 'sms', 'whatsapp'] },
              purpose: { type: 'string', enum: ['appointment_updates', 'marketing'] },
              state: { type: 'string', enum: ['granted', 'withdrawn'] },
              source: { type: 'string', enum: ['web_form', 'paper', 'verbal', 'staff_entry', 'import'] },
              policyVersion: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,64}$' },
              evidenceReference: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
            },
            required: ['channel', 'purpose', 'state', 'source'],
          },
          response: {
            201: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                contactId: { type: 'string', format: 'uuid' },
                channel: { type: 'string', enum: ['email', 'sms', 'whatsapp'] },
                purpose: { type: 'string', enum: ['appointment_updates', 'marketing'] },
                state: { type: 'string', enum: ['granted', 'withdrawn'] },
                source: { type: 'string', enum: ['web_form', 'paper', 'verbal', 'staff_entry', 'import'] },
                policyVersion: { type: ['string', 'null'] },
                evidenceReference: { type: ['string', 'null'] },
                actorSubject: { type: 'string' },
                recordedAt: { type: 'string', format: 'date-time' },
              },
              required: [
                'id', 'contactId', 'channel', 'purpose', 'state', 'source',
                'policyVersion', 'evidenceReference', 'actorSubject', 'recordedAt',
              ],
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { contactId } = request.params as { contactId: string }
          const body = request.body as {
            channel: 'email' | 'sms' | 'whatsapp'
            purpose: 'appointment_updates' | 'marketing'
            state: 'granted' | 'withdrawn'
            source: 'web_form' | 'paper' | 'verbal' | 'staff_entry' | 'import'
            policyVersion?: string
            evidenceReference?: string
          }
          const created = await recordContactConsent(
            options.tenantDatabase!,
            request.identity!.subject,
            {
              tenantId: request.tenantId!,
              locationId: request.locationId,
              contactId,
              ...body,
            },
          )
          return reply.status(201).send(created)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_consent' })
          if (error instanceof ContactError) {
            return reply.status(error.code === 'not_found' ? 404 : 400).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/v1/tenant/practitioners',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'practitioner.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List practitioners assigned to the active location',
          security: [{ bearerAuth: [] }],
          response: {
            200: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  displayName: { type: 'string' },
                  registrationAuthority: { type: 'string' },
                  registrationNumber: { type: 'string' },
                  verificationStatus: { type: 'string', enum: ['unverified', 'pending', 'verified', 'rejected'] },
                  assignmentId: { type: 'string', format: 'uuid' },
                  locationId: { type: 'string', format: 'uuid' },
                  assignmentStatus: { type: 'string', enum: ['active', 'inactive'] },
                  publicationState: { type: 'string', enum: ['draft', 'published', 'unpublished'] },
                },
                required: [
                  'id', 'displayName', 'registrationAuthority', 'registrationNumber',
                  'verificationStatus', 'assignmentId', 'locationId', 'assignmentStatus',
                  'publicationState',
                ],
              },
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        return listPractitioners(options.tenantDatabase!, request.tenantId!, request.locationId)
      },
    )
    routes.post(
      '/v1/tenant/practitioners',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'practitioner.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Create a practitioner and assign them to the active location',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              displayName: { type: 'string', minLength: 1, maxLength: 160 },
              registrationAuthority: { type: 'string', minLength: 1, maxLength: 80 },
              registrationNumber: { type: 'string', minLength: 1, maxLength: 80 },
            },
            required: ['displayName', 'registrationAuthority', 'registrationNumber'],
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const body = request.body as {
            displayName: string
            registrationAuthority: string
            registrationNumber: string
          }
          const practitioner = await createPractitioner(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, ...body },
          )
          return reply.status(201).send(practitioner)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_practitioner' })
          if (error instanceof PractitionerError || error instanceof EntitlementError) {
            return reply.status(409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.post(
      '/v1/tenant/practitioners/:practitionerId/locations',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'practitioner.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Assign an existing practitioner to the active location',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { practitionerId: { type: 'string', format: 'uuid' } },
            required: ['practitionerId'],
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { practitionerId } = request.params as { practitionerId: string }
          const assignment = await assignPractitionerToLocation(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, practitionerId },
          )
          return reply.status(201).send(assignment)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_practitioner_id' })
          if (error instanceof PractitionerError) {
            return reply.status(error.code === 'not_found' ? 404 : 409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.patch(
      '/v1/tenant/practitioners/:practitionerId/verification',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'practitioner.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Record registration verification for a practitioner',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { practitionerId: { type: 'string', format: 'uuid' } },
            required: ['practitionerId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              verificationStatus: { type: 'string', enum: ['pending', 'verified', 'rejected'] },
              evidenceReference: { type: 'string', pattern: '^[A-Za-z0-9._:-]{1,128}$' },
            },
            required: ['verificationStatus'],
          },
          response: {
            200: { type: 'object', properties: { id: { type: 'string', format: 'uuid' }, verificationStatus: { type: 'string' } }, required: ['id', 'verificationStatus'] },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { practitionerId } = request.params as { practitionerId: string }
          const body = request.body as {
            verificationStatus: 'pending' | 'verified' | 'rejected'
            evidenceReference?: string
          }
          return await updatePractitionerVerification(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, practitionerId, ...body },
          )
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_verification' })
          if (error instanceof PractitionerError) {
            const statusCode = error.code === 'not_found' ? 404 : error.code === 'evidence_required' ? 400 : 409
            return reply.status(statusCode).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.patch(
      '/v1/tenant/practitioners/:practitionerId/location',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'practitioner.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Update an active location assignment and publication state',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { practitionerId: { type: 'string', format: 'uuid' } },
            required: ['practitionerId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              status: { type: 'string', enum: ['active', 'inactive'] },
              publicationState: { type: 'string', enum: ['draft', 'published', 'unpublished'] },
            },
            required: ['status', 'publicationState'],
          },
          response: {
            200: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { practitionerId } = request.params as { practitionerId: string }
          const body = request.body as {
            status: 'active' | 'inactive'
            publicationState: 'draft' | 'published' | 'unpublished'
          }
          return await updatePractitionerLocation(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, practitionerId, ...body },
          )
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_practitioner_location' })
          if (error instanceof PractitionerError) {
            return reply.status(error.code === 'not_found' ? 404 : 409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/v1/tenant/catalog',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.read')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'List the active location service catalog and practitioner assignments',
          security: [{ bearerAuth: [] }],
          response: {
            200: { type: 'array', items: { type: 'object', additionalProperties: true } },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        return listLocationCatalog(options.tenantDatabase!, request.tenantId!, request.locationId)
      },
    )
    routes.post(
      '/v1/tenant/catalog/categories',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Create a tenant-wide clinic service category',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              name: { type: 'string', minLength: 1, maxLength: 120 },
              slug: { type: 'string', minLength: 1, maxLength: 63 },
            },
            required: ['name', 'slug'],
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (request.locationId) return reply.status(400).send({ error: 'tenant_scope_required' })
        try {
          const body = request.body as { name: string; slug: string }
          const category = await createServiceCategory(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, ...body },
          )
          return reply.status(201).send(category)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_service_category' })
          if (error instanceof CatalogError) return reply.status(409).send({ error: error.code })
          throw error
        }
      },
    )
    routes.post(
      '/v1/tenant/catalog/services',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Create a tenant-wide clinic service definition',
          security: [{ bearerAuth: [] }],
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              categoryId: { type: 'string', format: 'uuid' },
              name: { type: 'string', minLength: 1, maxLength: 160 },
              slug: { type: 'string', minLength: 1, maxLength: 63 },
              defaultDurationMinutes: { type: 'integer', minimum: 5, maximum: 480 },
            },
            required: ['categoryId', 'name', 'slug', 'defaultDurationMinutes'],
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (request.locationId) return reply.status(400).send({ error: 'tenant_scope_required' })
        try {
          const body = request.body as {
            categoryId: string
            name: string
            slug: string
            defaultDurationMinutes: number
          }
          const service = await createService(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, ...body },
          )
          return reply.status(201).send(service)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_service' })
          if (error instanceof CatalogError) {
            return reply.status(error.code === 'not_found' ? 404 : 409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.post(
      '/v1/tenant/catalog/services/:serviceId/locations',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Offer a clinic service at the active location',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { serviceId: { type: 'string', format: 'uuid' } },
            required: ['serviceId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              durationOverrideMinutes: { type: 'integer', minimum: 5, maximum: 480 },
              priceAmountMinor: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
              currencyCode: { type: 'string', pattern: '^[A-Za-z]{3}$' },
            },
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { serviceId } = request.params as { serviceId: string }
          const body = request.body as {
            durationOverrideMinutes?: number
            priceAmountMinor?: number
            currencyCode?: string
          }
          const offering = await createLocationOffering(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, serviceId, ...body },
          )
          return reply.status(201).send(offering)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_location_offering' })
          if (error instanceof CatalogError) {
            return reply.status(error.code === 'not_found' ? 404
              : error.code === 'price_currency_mismatch' || error.code === 'invalid_currency' ? 400
                : 409)
              .send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.patch(
      '/v1/tenant/catalog/services/:serviceId/locations',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Update a clinic service offering at the active location',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { serviceId: { type: 'string', format: 'uuid' } },
            required: ['serviceId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: {
              durationOverrideMinutes: { type: ['integer', 'null'], minimum: 5, maximum: 480 },
              priceAmountMinor: { type: ['integer', 'null'], minimum: 0, maximum: Number.MAX_SAFE_INTEGER },
              currencyCode: { type: ['string', 'null'], pattern: '^[A-Za-z]{3}$' },
              status: { type: 'string', enum: ['active', 'inactive'] },
            },
            required: ['durationOverrideMinutes', 'priceAmountMinor', 'currencyCode', 'status'],
          },
          response: {
            200: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { serviceId } = request.params as { serviceId: string }
          const body = request.body as {
            durationOverrideMinutes: number | null
            priceAmountMinor: number | null
            currencyCode: string | null
            status: 'active' | 'inactive'
          }
          return await updateLocationOffering(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, serviceId, ...body },
          )
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_location_offering' })
          if (error instanceof CatalogError) {
            return reply.status(error.code === 'not_found' ? 404 : 400).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.post(
      '/v1/tenant/catalog/services/:serviceId/practitioners/:practitionerId',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Assign an active practitioner to an offered service at the active location',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: {
              serviceId: { type: 'string', format: 'uuid' },
              practitionerId: { type: 'string', format: 'uuid' },
            },
            required: ['serviceId', 'practitionerId'],
          },
          response: {
            201: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { serviceId, practitionerId } = request.params as { serviceId: string; practitionerId: string }
          const assignment = await assignPractitionerToService(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, serviceId, practitionerId },
          )
          return reply.status(201).send(assignment)
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_service_assignment' })
          if (error instanceof CatalogError) {
            return reply.status(error.code === 'not_found' ? 404 : 409).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.patch(
      '/v1/tenant/catalog/services/:serviceId/practitioners/:practitionerId',
      {
        preHandler: options.tenantDatabase
          ? [tenantRealmGuard, requireTenantPermission(options.tenantDatabase, 'catalog.manage')]
          : tenantUnavailable,
        schema: {
          tags: ['tenant'],
          summary: 'Activate or deactivate a practitioner-service assignment',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: {
              serviceId: { type: 'string', format: 'uuid' },
              practitionerId: { type: 'string', format: 'uuid' },
            },
            required: ['serviceId', 'practitionerId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { status: { type: 'string', enum: ['active', 'inactive'] } },
            required: ['status'],
          },
          response: {
            200: { type: 'object', additionalProperties: true },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            409: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!request.locationId) return reply.status(400).send({ error: 'location_context_required' })
        try {
          const { serviceId, practitionerId } = request.params as { serviceId: string; practitionerId: string }
          const body = request.body as { status: 'active' | 'inactive' }
          return await updatePractitionerServiceStatus(
            options.tenantDatabase!,
            request.identity!.subject,
            { tenantId: request.tenantId!, locationId: request.locationId, serviceId, practitionerId, ...body },
          )
        } catch (error) {
          if (error instanceof z.ZodError) return reply.status(400).send({ error: 'invalid_service_assignment' })
          if (error instanceof CatalogError) {
            const statusCode = error.code === 'not_found' ? 404 : 409
            return reply.status(statusCode).send({ error: error.code })
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
    routes.post(
      '/v1/platform/tenants/:tenantId/support-sessions',
      {
        preHandler: options.platformDatabase ? platformStaffGuard : platformDatabaseUnavailable,
        schema: {
          tags: ['platform'],
          summary: 'Start a short-lived read-only support session',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { tenantId: { type: 'string', format: 'uuid' } },
            required: ['tenantId'],
          },
          body: {
            type: 'object',
            additionalProperties: false,
            properties: { reason: { type: 'string', minLength: 20, maxLength: 500 } },
            required: ['reason'],
          },
          response: {
            201: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                token: { type: 'string' },
                tenantId: { type: 'string', format: 'uuid' },
                tenantName: { type: 'string' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
              required: ['id', 'token', 'tenantId', 'tenantName', 'expiresAt'],
            },
            400: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            403: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            503: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!options.platformDatabase) return reply.code(503).send({ error: 'platform_database_unavailable' })
        const { tenantId } = request.params as { tenantId: string }
        const { reason } = request.body as { reason: string }
        try {
          const session = await createSupportSession(
            options.platformDatabase,
            request.identity!,
            { tenantId, reason },
          )
          return reply.status(201).send(session)
        } catch (error) {
          if (error instanceof SupportSessionError) {
            const status = error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 400
            return reply.status(status).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.get(
      '/v1/platform/support-sessions/:supportSessionId/snapshot',
      {
        preHandler: options.platformDatabase ? platformStaffGuard : platformDatabaseUnavailable,
        schema: {
          tags: ['platform'],
          summary: 'Read a minimal, read-only tenant support snapshot',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { supportSessionId: { type: 'string', format: 'uuid' } },
            required: ['supportSessionId'],
          },
          headers: {
            type: 'object',
            properties: { 'x-support-token': { type: 'string' } },
            required: ['x-support-token'],
          },
        },
      },
      async (request, reply) => {
        if (!options.platformDatabase) return reply.code(503).send({ error: 'platform_database_unavailable' })
        const { supportSessionId } = request.params as { supportSessionId: string }
        const token = request.headers['x-support-token']
        if (typeof token !== 'string') return reply.code(403).send({ error: 'forbidden' })
        try {
          return await readSupportSnapshot(options.platformDatabase, request.identity!, {
            supportSessionId,
            token,
          })
        } catch (error) {
          if (error instanceof SupportSessionError) {
            const status = error.code === 'forbidden' ? 403 : error.code === 'not_found' ? 404 : 410
            return reply.status(status).send({ error: error.code })
          }
          throw error
        }
      },
    )
    routes.delete(
      '/v1/platform/support-sessions/:supportSessionId',
      {
        preHandler: options.platformDatabase ? platformStaffGuard : platformDatabaseUnavailable,
        schema: {
          tags: ['platform'],
          summary: 'End a read-only tenant support session',
          security: [{ bearerAuth: [] }],
          params: {
            type: 'object',
            properties: { supportSessionId: { type: 'string', format: 'uuid' } },
            required: ['supportSessionId'],
          },
          response: {
            204: { type: 'null' },
            403: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            404: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
            503: { type: 'object', properties: { error: { type: 'string' } }, required: ['error'] },
          },
        },
      },
      async (request, reply) => {
        if (!options.platformDatabase) return reply.code(503).send({ error: 'platform_database_unavailable' })
        const { supportSessionId } = request.params as { supportSessionId: string }
        try {
          await revokeSupportSession(options.platformDatabase, request.identity!, supportSessionId)
          return reply.status(204).send()
        } catch (error) {
          if (error instanceof SupportSessionError) {
            return reply.status(error.code === 'forbidden' ? 403 : 404).send({ error: error.code })
          }
          throw error
        }
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
            409: {
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
          if (error instanceof EntitlementError) return reply.status(409).send({ error: error.code })
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
    routes.get(
      '/v1/openapi.json',
      { schema: { hide: true } },
      async () => routes.swagger(),
    )
  })

  return app
}
