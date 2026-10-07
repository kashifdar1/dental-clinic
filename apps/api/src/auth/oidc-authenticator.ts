import type { AuthenticatedIdentity, Authenticator } from '@clinic-hub/shared'
import { createRemoteJWKSet, decodeJwt, jwtVerify } from 'jose'
import type { ApiConfig } from '../config.js'

export class OidcAuthenticator implements Authenticator {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>

  constructor(
    private readonly options: {
      realm: 'tenant' | 'platform'
      issuer: string
      jwksUrl: string
      audience: string
      requireMfa: boolean
    },
  ) {
    this.jwks = createRemoteJWKSet(new URL(options.jwksUrl))
  }

  matchesIssuer(issuer: unknown): boolean {
    return issuer === this.options.issuer
  }

  async authenticate(accessToken: string): Promise<AuthenticatedIdentity | null> {
    try {
      const { payload } = await jwtVerify(accessToken, this.jwks, {
        issuer: this.options.issuer,
        audience: this.options.audience,
        algorithms: ['RS256'],
      })
      if (typeof payload.sub !== 'string' || payload.sub.length === 0) return null
      const amr = [
        ...(Array.isArray(payload.amr) ? payload.amr : []),
        ...(Array.isArray(payload['cognito:amr']) ? payload['cognito:amr'] : []),
      ]
      const acr = typeof payload.acr === 'string' ? payload.acr : ''
      const mfaVerified =
        amr.some((method) => method === 'mfa' || method === 'otp') ||
        acr.toLowerCase().includes('mfa')
      if (this.options.requireMfa && !mfaVerified) return null

      return {
        subject: payload.sub,
        realm: this.options.realm,
        email: typeof payload.email === 'string' ? payload.email : undefined,
        emailVerified: payload.email_verified === true,
        mfaVerified,
      }
    } catch {
      return null
    }
  }
}

const rejectIdentity: Authenticator = {
  async authenticate() {
    return null
  },
}

class RealmAuthenticator implements Authenticator {
  constructor(private readonly authenticators: OidcAuthenticator[]) {}

  async authenticate(accessToken: string): Promise<AuthenticatedIdentity | null> {
    try {
      const issuer = decodeJwt(accessToken).iss
      const authenticator = this.authenticators.find((candidate) =>
        candidate.matchesIssuer(issuer),
      )
      return authenticator ? authenticator.authenticate(accessToken) : null
    } catch {
      return null
    }
  }
}

export function createIdentityAuthenticator(config: ApiConfig): Authenticator {
  if (config.identityMode !== 'oidc') return rejectIdentity
  if (!config.tenantAuth || !config.platformAuth) {
    throw new Error('Separate tenant and platform OIDC configuration is required')
  }
  return new RealmAuthenticator([
    new OidcAuthenticator({ realm: 'tenant', ...config.tenantAuth, requireMfa: false }),
    new OidcAuthenticator({
      realm: 'platform',
      ...config.platformAuth,
      requireMfa: config.platformMfaRequired,
    }),
  ])
}
