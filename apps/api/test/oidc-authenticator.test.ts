import { createServer, type Server } from 'node:http'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { exportJWK, generateKeyPair, SignJWT, type JWK } from 'jose'
import { OidcAuthenticator } from '../src/auth/oidc-authenticator.js'
import { readConfig } from '../src/config.js'
import { createIdentityAuthenticator } from '../src/auth/oidc-authenticator.js'

const issuer = 'https://identity.example.test/'
const audience = 'clinic-hub-api'
const keyId = 'local-test-key'
let server: Server
let jwksUrl: string
let platformJwksUrl: string
let signer: CryptoKey
let otherSigner: CryptoKey

beforeAll(async () => {
  const pair = await generateKeyPair('RS256')
  const otherPair = await generateKeyPair('RS256')
  signer = pair.privateKey as CryptoKey
  otherSigner = otherPair.privateKey as CryptoKey
  const publicJwk = (await exportJWK(pair.publicKey)) as JWK & {
    alg: string
    kid: string
    use: string
  }
  publicJwk.alg = 'RS256'
  publicJwk.kid = keyId
  publicJwk.use = 'sig'
  const platformJwk = (await exportJWK(otherPair.publicKey)) as JWK & {
    alg: string
    kid: string
    use: string
  }
  platformJwk.alg = 'RS256'
  platformJwk.kid = keyId
  platformJwk.use = 'sig'

  server = createServer((request, response) => {
    const jwks =
      request.url === '/jwks.json'
        ? [publicJwk]
        : request.url === '/platform-jwks.json'
          ? [platformJwk]
          : undefined
    if (!jwks) {
      response.writeHead(404).end()
      return
    }
    response.writeHead(200, {
      'cache-control': 'public, max-age=60',
      'content-type': 'application/json',
    })
    response.end(JSON.stringify({ keys: jwks }))
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('JWKS test server did not bind')
  jwksUrl = `http://127.0.0.1:${address.port}/jwks.json`
  platformJwksUrl = `http://127.0.0.1:${address.port}/platform-jwks.json`
})

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  )
})

async function signToken(options: {
  key?: CryptoKey
  tokenIssuer?: string
  tokenAudience?: string
  subject?: string
  mfa?: boolean
}) {
  return new SignJWT({
      email: 'owner@example.test',
      email_verified: true,
    ...(options.mfa ? { amr: ['pwd', 'mfa'] } : {}),
  })
    .setProtectedHeader({ alg: 'RS256', kid: keyId })
    .setIssuer(options.tokenIssuer ?? issuer)
    .setAudience(options.tokenAudience ?? audience)
    .setSubject(options.subject ?? 'user-123')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(options.key ?? signer)
}

describe('OIDC authenticator', () => {
  it('verifies signature, issuer, audience, and maps a generic identity', async () => {
    const authenticator = new OidcAuthenticator({
      realm: 'tenant',
      issuer,
      jwksUrl,
      audience,
      requireMfa: false,
    })
    const identity = await authenticator.authenticate(await signToken({}))

    expect(identity).toEqual({
      subject: 'user-123',
      realm: 'tenant',
      email: 'owner@example.test',
      emailVerified: true,
      mfaVerified: false,
    })
  })

  it('rejects an untrusted issuer, audience, or signing key', async () => {
    const authenticator = new OidcAuthenticator({
      realm: 'tenant',
      issuer,
      jwksUrl,
      audience,
      requireMfa: false,
    })

    await expect(
      authenticator.authenticate(await signToken({ tokenIssuer: 'https://attacker.example/' })),
    ).resolves.toBeNull()
    await expect(
      authenticator.authenticate(await signToken({ tokenAudience: 'another-api' })),
    ).resolves.toBeNull()
    await expect(
      authenticator.authenticate(await signToken({ key: otherSigner })),
    ).resolves.toBeNull()
  })

  it('requires verified MFA for platform realm identities', async () => {
    const authenticator = new OidcAuthenticator({
      realm: 'platform',
      issuer,
      jwksUrl,
      audience,
      requireMfa: true,
    })

    await expect(authenticator.authenticate(await signToken({}))).resolves.toBeNull()
    await expect(
      authenticator.authenticate(await signToken({ mfa: true })),
    ).resolves.toMatchObject({ realm: 'platform', mfaVerified: true })
  })

  it('selects separate tenant and platform issuers and signing keys', async () => {
    const config = readConfig({
      DATABASE_URL: 'postgres://app:local@localhost/clinic_hub',
      IDENTITY_MODE: 'oidc',
      TENANT_AUTH_ISSUER_URL: `${issuer}tenant`,
      TENANT_AUTH_JWKS_URL: jwksUrl,
      TENANT_AUTH_AUDIENCE: 'tenant-api',
      PLATFORM_AUTH_ISSUER_URL: `${issuer}platform`,
      PLATFORM_AUTH_JWKS_URL: platformJwksUrl,
      PLATFORM_AUTH_AUDIENCE: 'platform-api',
      PLATFORM_MFA_REQUIRED: 'true',
    })
    const authenticator = createIdentityAuthenticator(config)
    const tenantToken = await signToken({
      tokenIssuer: `${issuer}tenant`,
      tokenAudience: 'tenant-api',
    })
    const platformToken = await signToken({
      key: otherSigner,
      tokenIssuer: `${issuer}platform`,
      tokenAudience: 'platform-api',
      mfa: true,
    })
    const platformWithoutMfa = await signToken({
      key: otherSigner,
      tokenIssuer: `${issuer}platform`,
      tokenAudience: 'platform-api',
    })

    await expect(authenticator.authenticate(tenantToken)).resolves.toMatchObject({
      realm: 'tenant',
      mfaVerified: false,
    })
    await expect(authenticator.authenticate(platformToken)).resolves.toMatchObject({
      realm: 'platform',
      mfaVerified: true,
    })
    await expect(authenticator.authenticate(platformWithoutMfa)).resolves.toBeNull()
  })
})
