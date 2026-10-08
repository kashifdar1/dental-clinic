import { afterEach, describe, expect, it } from 'vitest'
import {
  API_CONTRACT_VERSION,
  HISAppointmentEventSchema,
  HISAppointmentRequestSchema,
  HIS_REQUEST_VERSION,
  IdempotencyKeySchema,
} from '@clinic-hub/shared'
import { createApi } from '../src/app.js'
import type { SessionStore } from '../src/auth/session-store.js'

const apps: ReturnType<typeof createApi>[] = []
const emptySessionStore: SessionStore = {
  async create() {
    throw new Error('not used by OpenAPI test')
  },
  async load() {
    return null
  },
  async revoke() {},
  verifyCsrf() {
    return false
  },
}

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()))
})

describe('API health endpoints', () => {
  it('reports liveness without depending on PostgreSQL', async () => {
    const app = createApi({
      checkDatabase: async () => {
        throw new Error('database should not be checked for liveness')
      },
      logger: false,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/live' })

    expect(response.statusCode).toBe(200)
    expect(response.json()).toEqual({ status: 'ok' })
  })

  it('reports readiness only when PostgreSQL is available', async () => {
    const app = createApi({
      checkDatabase: async () => {},
      logger: false,
    })
    apps.push(app)

    const ready = await app.inject({ method: 'GET', url: '/health/ready' })
    expect(ready.statusCode).toBe(200)
    expect(ready.json()).toEqual({ status: 'ready' })
  })

  it('publishes an OpenAPI document for the health routes', async () => {
    const app = createApi({
      checkDatabase: async () => {},
      logger: false,
      sessionStores: {
        tenant: emptySessionStore,
        platform: emptySessionStore,
      },
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/openapi.json' })
    const document = response.json()
    const versionedResponse = await app.inject({ method: 'GET', url: '/v1/openapi.json' })
    const versionedDocument = versionedResponse.json()

    expect(response.statusCode).toBe(200)
    expect(document.openapi).toMatch(/^3\./)
    expect(document.info.version).toBe(API_CONTRACT_VERSION)
    expect(versionedResponse.statusCode).toBe(200)
    expect(versionedDocument).toEqual(document)
    expect(document.paths['/health/live']).toBeDefined()
    expect(document.paths['/health/ready']).toBeDefined()
    expect(document.paths['/v1/me']).toBeDefined()
    expect(document.paths['/auth/tenant/session']).toBeDefined()
    expect(document.paths['/auth/platform/session']).toBeDefined()
    expect(document.paths['/v1/tenant/appointments'].post.parameters).toContainEqual(
      expect.objectContaining({ name: 'idempotency-key', in: 'header' }),
    )
  })

  it('validates versioned HIS appointment and idempotency contracts', () => {
    expect(IdempotencyKeySchema.safeParse('short').success).toBe(false)
    expect(IdempotencyKeySchema.safeParse('his-request-2026-0001').success).toBe(true)
    expect(HISAppointmentRequestSchema.safeParse({
      contractVersion: HIS_REQUEST_VERSION,
      externalPatientRef: 'HIS-123',
      serviceId: '00000000-0000-4000-8000-000000000011',
      practitionerId: '00000000-0000-4000-8000-000000000012',
      startsAt: '2030-01-07T04:00:00.000Z',
    }).success).toBe(true)
    expect(HISAppointmentEventSchema.safeParse({
      contractVersion: '1',
      eventId: '00000000-0000-4000-8000-000000000013',
      eventType: 'appointment.requested',
      occurredAt: '2030-01-07T04:00:00.000Z',
      tenantId: '00000000-0000-4000-8000-000000000001',
      locationId: '00000000-0000-4000-8000-000000000011',
      appointmentId: '00000000-0000-4000-8000-000000000014',
      serviceId: '00000000-0000-4000-8000-000000000015',
      practitionerId: '00000000-0000-4000-8000-000000000016',
      startsAt: '2030-01-07T04:00:00.000Z',
      endsAt: '2030-01-07T04:30:00.000Z',
      status: 'requested',
      externalPatientRef: 'HIS-123',
    }).success).toBe(true)
  })

  it('fails closed on protected routes and accepts only an authenticated identity', async () => {
    const deniedApp = createApi({ checkDatabase: async () => {}, logger: false })
    apps.push(deniedApp)
    const denied = await deniedApp.inject({ method: 'GET', url: '/v1/me' })
    expect(denied.statusCode).toBe(401)

    const protectedApp = createApi({
      checkDatabase: async () => {},
      logger: false,
      authenticator: {
        async authenticate(accessToken) {
          return accessToken === 'valid-token'
            ? {
                subject: 'user-123',
                realm: 'tenant',
                email: 'owner@example.test',
                emailVerified: true,
                mfaVerified: false,
              }
            : null
        },
      },
    })
    apps.push(protectedApp)
    const accepted = await protectedApp.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer valid-token' },
    })
    const rejected = await protectedApp.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { authorization: 'Bearer invalid-token' },
    })

    expect(accepted.statusCode).toBe(200)
    expect(accepted.json()).toEqual({
      subject: 'user-123',
      realm: 'tenant',
      email: 'owner@example.test',
      emailVerified: true,
      mfaVerified: false,
    })
    expect(rejected.statusCode).toBe(401)
  })

  it('creates server sessions and enforces CSRF and realm checks on cookie auth', async () => {
    let revokedToken: string | undefined
    const session = {
      subject: 'user-123',
      realm: 'tenant' as const,
      email: 'owner@example.test',
      emailVerified: true,
      mfaVerified: false,
      csrfHash: 'stored-csrf-hash',
      expiresAt: new Date(Date.now() + 60_000),
    }
    const app = createApi({
      checkDatabase: async () => {},
      logger: false,
      secureCookies: false,
      authenticator: {
        async authenticate(token) {
          return token === 'valid-token'
            ? {
                subject: 'user-123',
                realm: 'tenant',
                email: 'owner@example.test',
                emailVerified: true,
                mfaVerified: false,
              }
            : null
        },
      },
      sessionStore: {
        async create() {
          return { sessionToken: 'session-token', csrfToken: 'csrf-token', record: session }
        },
        async load(token) {
          return token === 'session-token' ? session : null
        },
        async revoke(token) {
          revokedToken = token
        },
        verifyCsrf(_record, token) {
          return token === 'csrf-token'
        },
      },
    })
    apps.push(app)

    const created = await app.inject({
      method: 'POST',
      url: '/auth/tenant/session',
      headers: { authorization: 'Bearer valid-token' },
    })
    expect(created.statusCode).toBe(204)
    expect(created.headers['set-cookie']).toBeDefined()

    const cookie = 'clinic_tenant_session=session-token; clinic_tenant_csrf=csrf-token'
    const tenantIdentity = await app.inject({
      method: 'GET',
      url: '/v1/me',
      headers: { cookie },
    })
    const wrongRealm = await app.inject({
      method: 'GET',
      url: '/v1/platform/me',
      headers: { cookie },
    })
    expect(tenantIdentity.statusCode).toBe(200)
    expect(wrongRealm.statusCode).toBe(403)

    const csrfDenied = await app.inject({
      method: 'DELETE',
      url: '/auth/tenant/session',
      headers: { cookie },
    })
    const loggedOut = await app.inject({
      method: 'DELETE',
      url: '/auth/tenant/session',
      headers: { cookie, 'x-csrf-token': 'csrf-token' },
    })
    expect(csrfDenied.statusCode).toBe(403)
    expect(loggedOut.statusCode).toBe(204)
    expect(revokedToken).toBe('session-token')
  })

  it('uses a separate platform session cookie and requires MFA at session exchange', async () => {
    const app = createApi({
      checkDatabase: async () => {},
      logger: false,
      secureCookies: false,
      authenticator: {
        async authenticate(token) {
          return token === 'platform-mfa'
            ? {
                subject: 'platform-admin',
                realm: 'platform',
                email: 'admin@example.test',
                emailVerified: true,
                mfaVerified: true,
              }
            : token === 'platform-no-mfa'
              ? {
                  subject: 'platform-admin',
                  realm: 'platform',
                  email: 'admin@example.test',
                  emailVerified: true,
                  mfaVerified: false,
                }
              : null
        },
      },
      sessionStore: {
        async create(identity) {
          return {
            sessionToken: 'platform-session-token',
            csrfToken: 'platform-csrf-token',
            record: {
              ...identity,
              csrfHash: 'stored-csrf-hash',
              expiresAt: new Date(Date.now() + 60_000),
            },
          }
        },
        async load() {
          return null
        },
        async revoke() {},
        verifyCsrf() {
          return false
        },
      },
      sessionStores: {
        platform: {
          async create(identity) {
            return {
              sessionToken: 'platform-session-token',
              csrfToken: 'platform-csrf-token',
              record: {
                ...identity,
                csrfHash: 'platform-csrf-hash',
                expiresAt: new Date(Date.now() + 60_000),
              },
            }
          },
          async load() {
            return null
          },
          async revoke() {},
          verifyCsrf() {
            return false
          },
        },
      },
    })
    apps.push(app)

    const noMfa = await app.inject({
      method: 'POST',
      url: '/auth/platform/session',
      headers: { authorization: 'Bearer platform-no-mfa' },
    })
    const accepted = await app.inject({
      method: 'POST',
      url: '/auth/platform/session',
      headers: { authorization: 'Bearer platform-mfa' },
    })

    expect(noMfa.statusCode).toBe(403)
    expect(accepted.statusCode).toBe(204)
    const cookies = accepted.headers['set-cookie']
    expect(String(cookies)).toContain('clinic_platform_session=')
    expect(String(cookies)).toContain('clinic_platform_csrf=')
    expect(String(cookies)).not.toContain('clinic_tenant_session=')
  })

  it('requires platform realm, verified MFA, and active platform staff', async () => {
    const securityEvents: Array<{ eventType: string; reason?: unknown }> = []
    const app = createApi({
      checkDatabase: async () => {},
      logger: false,
      authenticator: {
        async authenticate(token) {
          if (token === 'tenant-token') {
            return {
              subject: 'tenant-user',
              realm: 'tenant',
              emailVerified: true,
              mfaVerified: true,
            }
          }
          if (token === 'platform-mfa-token') {
            return {
              subject: 'active-platform-admin',
              realm: 'platform',
              emailVerified: true,
              mfaVerified: true,
            }
          }
          if (token === 'platform-no-mfa-token') {
            return {
              subject: 'active-platform-admin',
              realm: 'platform',
              emailVerified: true,
              mfaVerified: false,
            }
          }
          return null
        },
      },
      isActivePlatformStaff: async (subject) => subject === 'active-platform-admin',
      recordSecurityEvent: async (event) => {
        securityEvents.push({ eventType: event.eventType, reason: event.metadata?.reason })
      },
    })
    apps.push(app)

    const accepted = await app.inject({
      method: 'GET',
      url: '/v1/platform/me',
      headers: { authorization: 'Bearer platform-mfa-token' },
    })
    const wrongRealm = await app.inject({
      method: 'GET',
      url: '/v1/platform/me',
      headers: { authorization: 'Bearer tenant-token' },
    })
    const noMfa = await app.inject({
      method: 'GET',
      url: '/v1/platform/me',
      headers: { authorization: 'Bearer platform-no-mfa-token' },
    })

    expect(accepted.statusCode).toBe(200)
    expect(wrongRealm.statusCode).toBe(403)
    expect(noMfa.statusCode).toBe(403)
    expect(securityEvents).toEqual([
      { eventType: 'platform.authorization_denied', reason: 'wrong_identity_realm' },
      { eventType: 'platform.authorization_denied', reason: 'platform_mfa_not_verified' },
    ])
  })

  it('returns a generic readiness response when PostgreSQL is unavailable', async () => {
    const app = createApi({
      checkDatabase: async () => {
        throw new Error('connection password must not be exposed')
      },
      logger: false,
    })
    apps.push(app)

    const response = await app.inject({ method: 'GET', url: '/health/ready' })

    expect(response.statusCode).toBe(503)
    expect(response.json()).toEqual({ status: 'not_ready' })
    expect(response.body).not.toContain('password')
  })
})
