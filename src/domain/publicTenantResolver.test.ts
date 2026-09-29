import { describe, expect, it } from 'vitest'
import { DEMO_DATA } from './seed'
import {
  buildPublicDemoPath,
  buildPublicPath,
  normalizeHostname,
  resolvePublicTenant,
} from './publicTenantResolver'

describe('public tenant resolver', () => {
  it('normalizes protocol, www, ports, and casing', () => {
    expect(normalizeHostname('https://WWW.IndusHospital.com:443/path')).toBe(
      'indushospital.com',
    )
  })

  it('resolves a standalone organization from its custom domain', () => {
    const tenant = resolvePublicTenant(DEMO_DATA, {
      hostname: 'www.lassanipolyclinic.com',
    })

    expect(tenant?.organization.slug).toBe('lasaani-poly-clinic')
    expect(tenant?.clinic?.id).toBe('clinic_harbor_downtown')
  })

  it('resolves a multi-clinic organization and branch from host and path', () => {
    const tenant = resolvePublicTenant(DEMO_DATA, {
      hostname: 'indushospital.com',
      cityCode: 'lhr',
      branchCode: '01',
    })

    expect(tenant?.organization.id).toBe('org_aurora')
    expect(tenant?.clinic?.id).toBe('clinic_aurora_east')
  })

  it('returns the multi-clinic organization overview without branch codes', () => {
    const tenant = resolvePublicTenant(DEMO_DATA, {
      hostname: 'indushospital.com',
    })

    expect(tenant?.organization.id).toBe('org_aurora')
    expect(tenant?.clinic).toBeUndefined()
  })

  it('rejects an unknown branch and unknown production domain', () => {
    expect(
      resolvePublicTenant(DEMO_DATA, {
        hostname: 'indushospital.com',
        cityCode: 'lhr',
        branchCode: '99',
      }),
    ).toBeNull()
    expect(
      resolvePublicTenant(DEMO_DATA, { hostname: 'unknown.example' }),
    ).toBeNull()
  })

  it('ignores host overrides on production hostnames', () => {
    const tenant = resolvePublicTenant(DEMO_DATA, {
      hostname: 'indushospital.com',
      hostOverride: 'lassanipolyclinic.com',
    })

    expect(tenant?.organization.id).toBe('org_aurora')
  })

  it('allows host overrides on local hostnames', () => {
    const tenant = resolvePublicTenant(DEMO_DATA, {
      hostname: '127.0.0.1',
      hostOverride: 'lassanipolyclinic.com',
    })

    expect(tenant?.organization.id).toBe('org_harbor')
  })

  it('builds standalone and multi-clinic public paths', () => {
    const indus = DEMO_DATA.organizations[0]
    const indusLahore = DEMO_DATA.clinics[1]
    const lasaani = DEMO_DATA.organizations[1]
    const lasaaniClinic = DEMO_DATA.clinics[2]

    expect(buildPublicPath(indus, indusLahore)).toBe('/lhr/01')
    expect(buildPublicPath(indus, indusLahore, 'doctor-1')).toBe(
      '/lhr/01/doctors/doctor-1',
    )
    expect(buildPublicPath(lasaani, lasaaniClinic)).toBe('/')
    expect(buildPublicPath(lasaani, lasaaniClinic, 'doctor-2')).toBe(
      '/doctors/doctor-2',
    )
    expect(
      buildPublicDemoPath(
        indus,
        indusLahore,
        '127.0.0.1',
        'doctor-1',
      ),
    ).toBe('/lhr/01/doctors/doctor-1?host=indushospital.com')
    expect(buildPublicDemoPath(indus, indusLahore, 'indushospital.com')).toBe(
      '/lhr/01',
    )
  })
})
