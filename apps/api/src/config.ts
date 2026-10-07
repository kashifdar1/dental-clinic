import type { IdentityProviderMode } from '@clinic-hub/shared'
import { z } from 'zod'

const optionalSetting = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().trim().min(1).optional(),
)

const databaseUrl = z
  .string()
  .url()
  .refine((value) => ['postgres:', 'postgresql:'].includes(new URL(value).protocol))

const EnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  HOST: z.string().trim().min(1).default('127.0.0.1'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  DATABASE_URL: databaseUrl,
  PLATFORM_DATABASE_URL: databaseUrl.optional(),
  CLOUD_REGION: optionalSetting,
  PLATFORM_DOMAIN: optionalSetting,
  IDENTITY_MODE: z.enum(['local', 'oidc']).default('local'),
  TENANT_AUTH_ISSUER_URL: z.string().url().optional(),
  TENANT_AUTH_JWKS_URL: z.string().url().optional(),
  TENANT_AUTH_AUDIENCE: optionalSetting,
  PLATFORM_AUTH_ISSUER_URL: z.string().url().optional(),
  PLATFORM_AUTH_JWKS_URL: z.string().url().optional(),
  PLATFORM_AUTH_AUDIENCE: optionalSetting,
  PLATFORM_MFA_REQUIRED: z.enum(['true', 'false']).default('true'),
})

export interface ApiConfig {
  nodeEnv: 'development' | 'test' | 'production'
  host: string
  port: number
  databaseUrl: string
  platformDatabaseUrl?: string
  cloudRegion?: string
  platformDomain?: string
  identityMode: IdentityProviderMode
  tenantAuth?: { issuer: string; jwksUrl: string; audience: string }
  platformAuth?: { issuer: string; jwksUrl: string; audience: string }
  platformMfaRequired: boolean
}

export function readConfig(env: NodeJS.ProcessEnv = process.env): ApiConfig {
  const parsed = EnvironmentSchema.safeParse(env)
  if (!parsed.success) {
    const fields = [...new Set(parsed.error.issues.map((issue) => issue.path[0]))]
    throw new Error(`Invalid API configuration: ${fields.join(', ')}`)
  }

  const values = parsed.data
  const missing = new Set<string>()

  if (values.NODE_ENV === 'production') {
    if (!values.CLOUD_REGION) missing.add('CLOUD_REGION')
    if (!values.PLATFORM_DOMAIN) missing.add('PLATFORM_DOMAIN')
    if (!values.PLATFORM_DATABASE_URL) missing.add('PLATFORM_DATABASE_URL')
    if (values.IDENTITY_MODE !== 'oidc') missing.add('IDENTITY_MODE=oidc')
  }
  if (values.IDENTITY_MODE === 'oidc') {
    if (!values.TENANT_AUTH_ISSUER_URL) missing.add('TENANT_AUTH_ISSUER_URL')
    if (!values.TENANT_AUTH_JWKS_URL) missing.add('TENANT_AUTH_JWKS_URL')
    if (!values.TENANT_AUTH_AUDIENCE) missing.add('TENANT_AUTH_AUDIENCE')
    if (!values.PLATFORM_AUTH_ISSUER_URL) missing.add('PLATFORM_AUTH_ISSUER_URL')
    if (!values.PLATFORM_AUTH_JWKS_URL) missing.add('PLATFORM_AUTH_JWKS_URL')
    if (!values.PLATFORM_AUTH_AUDIENCE) missing.add('PLATFORM_AUTH_AUDIENCE')
    if (
      values.TENANT_AUTH_ISSUER_URL &&
      values.TENANT_AUTH_ISSUER_URL === values.PLATFORM_AUTH_ISSUER_URL
    ) {
      missing.add('separate tenant and platform OIDC issuers')
    }
    if (values.NODE_ENV === 'production' && values.PLATFORM_MFA_REQUIRED !== 'true') {
      missing.add('PLATFORM_MFA_REQUIRED=true')
    }
  }
  if (missing.size > 0) {
    throw new Error(`Invalid API configuration: ${[...missing].join(', ')}`)
  }

  return {
    nodeEnv: values.NODE_ENV,
    host: values.HOST,
    port: values.PORT,
    databaseUrl: values.DATABASE_URL,
    platformDatabaseUrl: values.PLATFORM_DATABASE_URL,
    cloudRegion: values.CLOUD_REGION,
    platformDomain: values.PLATFORM_DOMAIN,
    identityMode: values.IDENTITY_MODE,
    tenantAuth:
      values.TENANT_AUTH_ISSUER_URL &&
      values.TENANT_AUTH_JWKS_URL &&
      values.TENANT_AUTH_AUDIENCE
        ? {
            issuer: values.TENANT_AUTH_ISSUER_URL,
            jwksUrl: values.TENANT_AUTH_JWKS_URL,
            audience: values.TENANT_AUTH_AUDIENCE,
          }
        : undefined,
    platformAuth:
      values.PLATFORM_AUTH_ISSUER_URL &&
      values.PLATFORM_AUTH_JWKS_URL &&
      values.PLATFORM_AUTH_AUDIENCE
        ? {
            issuer: values.PLATFORM_AUTH_ISSUER_URL,
            jwksUrl: values.PLATFORM_AUTH_JWKS_URL,
            audience: values.PLATFORM_AUTH_AUDIENCE,
          }
        : undefined,
    platformMfaRequired: values.PLATFORM_MFA_REQUIRED === 'true',
  }
}
