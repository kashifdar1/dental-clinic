import type { AuthenticatedIdentity, Authenticator } from '@clinic-hub/shared'
import type { preHandlerHookHandler } from 'fastify'
import '@fastify/cookie'
import { csrfCookieName, sessionCookieName } from './cookie-names.js'
import type { SessionStore } from './session-store.js'

declare module 'fastify' {
  interface FastifyRequest {
    identity: AuthenticatedIdentity | null
    tenantId?: string
    locationId?: string
  }
}

export function requireIdentity(
  authenticator: Authenticator,
  options: {
    expectedRealm?: 'tenant' | 'platform'
    sessionStore?: SessionStore
    sessionStores?: Partial<Record<'tenant' | 'platform', SessionStore>>
    secureCookies?: boolean
    requireVerifiedEmail?: boolean
    requireMfa?: boolean
  } = {},
): preHandlerHookHandler {
  return async (request, reply) => {
    const authorization = request.headers.authorization
    const match = authorization?.match(/^Bearer\s+(.+)$/i)
    let identity: AuthenticatedIdentity | null = null

    if (match) {
      try {
        identity = await authenticator.authenticate(match[1])
      } catch (error) {
        request.log.warn(
          { reason: error instanceof Error ? error.name : 'unknown' },
          'Authentication provider failed',
        )
        return reply.status(503).send({ error: 'identity_provider_unavailable' })
      }
    } else if (options.sessionStore || options.sessionStores) {
      const secure = options.secureCookies ?? false
      const tenantToken = request.cookies[sessionCookieName('tenant', secure)]
      const platformToken = request.cookies[sessionCookieName('platform', secure)]
      if (!options.expectedRealm && tenantToken && platformToken) {
        return reply.status(400).send({ error: 'ambiguous_session_realm' })
      }
      const realm = options.expectedRealm ?? (tenantToken ? 'tenant' : 'platform')
      const sessionStore =
        options.sessionStores?.[realm] ??
        (realm === 'tenant' ? options.sessionStore : undefined)
      const sessionToken = realm === 'tenant' ? tenantToken : platformToken
      if (!sessionToken) {
        if (options.expectedRealm && (tenantToken || platformToken)) {
          return reply.status(403).send({ error: 'forbidden' })
        }
        return reply
          .header('www-authenticate', 'Bearer')
          .status(401)
          .send({ error: 'unauthorized' })
      }
      if (!sessionStore) return reply.status(503).send({ error: 'session_store_unavailable' })

      const session = await sessionStore.load(sessionToken)
      if (!session || session.realm !== realm) return reply.status(401).send({ error: 'unauthorized' })
      identity = {
        subject: session.subject,
        realm: session.realm,
        email: session.email,
        emailVerified: session.emailVerified,
        mfaVerified: session.mfaVerified,
      }
      if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
        const csrfCookie = request.cookies[csrfCookieName(realm, secure)]
        const csrfHeader = request.headers['x-csrf-token']
        if (
          typeof csrfCookie !== 'string' ||
          typeof csrfHeader !== 'string' ||
          csrfCookie !== csrfHeader ||
          !sessionStore.verifyCsrf(session, csrfHeader)
        ) {
          return reply.status(403).send({ error: 'csrf_validation_failed' })
        }
      }
    }

    if (!identity) {
      return reply
        .header('www-authenticate', 'Bearer error="invalid_token"')
        .status(401)
        .send({ error: 'unauthorized' })
    }
    if (options.expectedRealm && identity.realm !== options.expectedRealm) {
      return reply.status(403).send({ error: 'forbidden' })
    }
    if (options.requireVerifiedEmail && !identity.emailVerified) {
      return reply.status(403).send({ error: 'email_verification_required' })
    }
    if (options.requireMfa && !identity.mfaVerified) {
      return reply.status(403).send({ error: 'mfa_required' })
    }
    request.identity = identity
  }
}
