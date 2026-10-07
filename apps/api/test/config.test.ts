import { describe, expect, it } from 'vitest'
import { readConfig } from '../src/config.js'

const databaseEnv = {
  DATABASE_URL: 'postgres://clinic_hub_app:local-dev-only@localhost:54329/clinic_hub',
}

describe('API configuration', () => {
  it('allows local configuration without a production region or domain', () => {
    const config = readConfig(databaseEnv)

    expect(config.nodeEnv).toBe('development')
    expect(config.identityMode).toBe('local')
    expect(config.cloudRegion).toBeUndefined()
    expect(config.platformDomain).toBeUndefined()
  })

  it('requires production region, domain, and OIDC settings without echoing values', () => {
    expect(() =>
      readConfig({
        ...databaseEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:private-secret@db.example/clinic',
      }),
    )
      .toThrow(/CLOUD_REGION, PLATFORM_DOMAIN, PLATFORM_DATABASE_URL, IDENTITY_MODE=oidc/)

    try {
      readConfig({
        ...databaseEnv,
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://user:private-secret@db.example/clinic',
      })
    } catch (error) {
      expect(String(error)).not.toContain('private-secret')
    }
  })

  it('reads region, domain, and identity provider settings from the environment', () => {
    const config = readConfig({
      ...databaseEnv,
      CLOUD_REGION: 'me-central-1',
      PLATFORM_DOMAIN: 'clinic.example.test',
      IDENTITY_MODE: 'oidc',
      TENANT_AUTH_ISSUER_URL: 'https://tenant-identity.example.test/',
      TENANT_AUTH_JWKS_URL: 'https://tenant-identity.example.test/.well-known/jwks.json',
      TENANT_AUTH_AUDIENCE: 'tenant-api',
      PLATFORM_AUTH_ISSUER_URL: 'https://platform-identity.example.test/',
      PLATFORM_AUTH_JWKS_URL: 'https://platform-identity.example.test/.well-known/jwks.json',
      PLATFORM_AUTH_AUDIENCE: 'platform-api',
      PLATFORM_MFA_REQUIRED: 'true',
    })

    expect(config).toMatchObject({
      cloudRegion: 'me-central-1',
      platformDomain: 'clinic.example.test',
      identityMode: 'oidc',
      tenantAuth: {
        issuer: 'https://tenant-identity.example.test/',
        jwksUrl: 'https://tenant-identity.example.test/.well-known/jwks.json',
        audience: 'tenant-api',
      },
      platformAuth: {
        issuer: 'https://platform-identity.example.test/',
        jwksUrl: 'https://platform-identity.example.test/.well-known/jwks.json',
        audience: 'platform-api',
      },
      platformMfaRequired: true,
    })
  })

  it('rejects non-PostgreSQL connection URLs', () => {
    expect(() => readConfig({ DATABASE_URL: 'https://example.test' })).toThrow(
      /DATABASE_URL/,
    )
  })
})
