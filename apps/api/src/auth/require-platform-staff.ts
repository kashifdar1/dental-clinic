import type { preHandlerHookHandler } from 'fastify'

export function requirePlatformStaff(
  isActiveStaff: (subject: string) => Promise<boolean>,
  recordDenied?: (event: {
    actorSubject?: string
    identityRealm?: 'tenant' | 'platform'
    requestId: string
    reason: string
  }) => Promise<void>,
): preHandlerHookHandler {
  return async (request, reply) => {
    const identity = request.identity
    const deny = async (status: 401 | 403, reason: string) => {
      try {
        await recordDenied?.({
          actorSubject: identity?.subject,
          identityRealm: identity?.realm,
          requestId: request.id,
          reason,
        })
      } catch (error) {
        request.log.error(
          { reason: error instanceof Error ? error.name : 'unknown' },
          'Security event write failed',
        )
      }
      return reply.status(status).send({ error: status === 401 ? 'unauthorized' : 'forbidden' })
    }

    if (!identity) return deny(401, 'missing_identity')
    if (identity.realm !== 'platform') {
      return deny(403, 'wrong_identity_realm')
    }
    if (!identity.mfaVerified) {
      return deny(403, 'platform_mfa_not_verified')
    }

    try {
      if (!(await isActiveStaff(identity.subject))) {
        return deny(403, 'platform_staff_not_active')
      }
    } catch (error) {
      request.log.error(
        { reason: error instanceof Error ? error.name : 'unknown' },
        'Platform staff check failed',
      )
      return reply.status(503).send({ error: 'authorization_unavailable' })
    }
  }
}
