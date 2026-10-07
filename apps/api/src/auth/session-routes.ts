import type { FastifyInstance } from 'fastify'
import type { Authenticator } from '@clinic-hub/shared'
import { csrfCookieName, sessionCookieName } from './cookie-names.js'
import type { SessionStore } from './session-store.js'
import { requireIdentity } from './require-identity.js'

export async function registerSessionRoutes(
  app: FastifyInstance,
  options: {
    authenticator: Authenticator
    stores: Partial<Record<'tenant' | 'platform', SessionStore>>
    secureCookies: boolean
  },
): Promise<void> {
  const cookieOptions = {
    path: '/',
    sameSite: 'strict' as const,
    secure: options.secureCookies,
  }

  for (const realm of ['tenant', 'platform'] as const) {
    const store = options.stores[realm]
    if (!store) continue
    const sessionCookie = sessionCookieName(realm, options.secureCookies)
    const csrfCookie = csrfCookieName(realm, options.secureCookies)
    const identityGuard = requireIdentity(options.authenticator, {
      expectedRealm: realm,
      sessionStores: options.stores,
      requireVerifiedEmail: true,
      requireMfa: realm === 'platform',
    })

    app.post(
      `/auth/${realm}/session`,
      {
        preHandler: identityGuard,
        schema: {
          tags: ['identity'],
          summary: `Create a ${realm} session`,
          security: [{ bearerAuth: [] }],
          response: {
            204: { type: 'null', description: 'Session cookies issued' },
            401: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
            403: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request, reply) => {
        const session = await store.create(request.identity!)
        reply.setCookie(sessionCookie, session.sessionToken, {
          ...cookieOptions,
          httpOnly: true,
          maxAge: 8 * 60 * 60,
        })
        reply.setCookie(csrfCookie, session.csrfToken, {
          ...cookieOptions,
          httpOnly: false,
          maxAge: 8 * 60 * 60,
        })
        return reply.status(204).send()
      },
    )

    app.get(
      `/auth/${realm}/session`,
      {
        schema: {
          tags: ['identity'],
          summary: `Read the ${realm} session`,
          response: {
            200: {
              type: 'object',
              properties: {
                subject: { type: 'string' },
                realm: { type: 'string', enum: [realm] },
                email: { type: 'string' },
                mfaVerified: { type: 'boolean' },
              },
              required: ['subject', 'realm', 'mfaVerified'],
            },
            401: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request, reply) => {
        const sessionToken = request.cookies[sessionCookie]
        if (!sessionToken) return reply.status(401).send({ error: 'unauthorized' })
        const session = await store.load(sessionToken)
        if (!session || session.realm !== realm) {
          reply.clearCookie(sessionCookie, cookieOptions)
          reply.clearCookie(csrfCookie, cookieOptions)
          return reply.status(401).send({ error: 'unauthorized' })
        }
        return {
          subject: session.subject,
          realm: session.realm,
          email: session.email,
          mfaVerified: session.mfaVerified,
        }
      },
    )

    app.delete(
      `/auth/${realm}/session`,
      {
        schema: {
          tags: ['identity'],
          summary: `Revoke the ${realm} session`,
          parameters: [
            {
              in: 'header',
              name: 'x-csrf-token',
              required: true,
              schema: { type: 'string' },
            },
          ],
          response: {
            204: { type: 'null', description: 'Session revoked' },
            403: {
              type: 'object',
              properties: { error: { type: 'string' } },
              required: ['error'],
            },
          },
        },
      },
      async (request, reply) => {
        const sessionToken = request.cookies[sessionCookie]
        const csrfCookieToken = request.cookies[csrfCookie]
        const csrfHeader = request.headers['x-csrf-token']
        if (!sessionToken || !csrfCookieToken || typeof csrfHeader !== 'string') {
          return reply.status(403).send({ error: 'csrf_validation_failed' })
        }

        const session = await store.load(sessionToken)
        if (
          !session ||
          session.realm !== realm ||
          csrfHeader !== csrfCookieToken ||
          !store.verifyCsrf(session, csrfHeader)
        ) {
          return reply.status(403).send({ error: 'csrf_validation_failed' })
        }

        await store.revoke(sessionToken)
        reply.clearCookie(sessionCookie, cookieOptions)
        reply.clearCookie(csrfCookie, cookieOptions)
        return reply.status(204).send()
      },
    )
  }
}
