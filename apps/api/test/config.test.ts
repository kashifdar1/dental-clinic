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
      .toThrow(/CLOUD_REGION, PLATFORM_DOMAIN, IDENTITY_MODE=oidc/)

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
      AUTH_ISSUER_URL: 'https://identity.example.test/',
      AUTH_AUDIENCE: 'clinic-hub-api',
    })

    expect(config).toMatchObject({
      cloudRegion: 'me-central-1',
      platformDomain: 'clinic.example.test',
      identityMode: 'oidc',
      authIssuerUrl: 'https://identity.example.test/',
      authAudience: 'clinic-hub-api',
    })
  })

  it('rejects non-PostgreSQL connection URLs', () => {
    expect(() => readConfig({ DATABASE_URL: 'https://example.test' })).toThrow(
      /DATABASE_URL/,
    )
  })
})
