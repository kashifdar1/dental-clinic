import { beforeEach, describe, expect, it } from 'vitest'
import {
  getActiveModules,
  getScopedPatients,
  getScopedPractitioners,
  importPractitioners,
  resetDemoData,
  setTenantContext,
  updateOrganizationSettings,
  upsertPractitioner,
} from '../domain/repository'
import { modulesForSpecialties } from '../domain/specialtyRegistry'

describe('specialty module registry', () => {
  it('derives unique sorted modules from specialties', () => {
    const modules = modulesForSpecialties([
      'dentistry',
      'general_medicine',
      'dentistry',
    ])
    expect(modules.map((m) => m.id)).toEqual(['dentistry', 'general_medicine'])
  })
})

describe('tenant repository', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('scopes practitioners and patients to the active clinic', () => {
    let data = resetDemoData()
    const auroraMain = getScopedPractitioners(data, data.context)
    const auroraPatients = getScopedPatients(data, data.context)

    expect(auroraMain.every((p) => p.clinicId === 'clinic_aurora_main')).toBe(
      true,
    )
    expect(auroraPatients.every((p) => p.clinicId === 'clinic_aurora_main')).toBe(
      true,
    )

    data = setTenantContext(data, {
      organizationId: 'org_harbor',
      clinicId: 'clinic_harbor_downtown',
      membershipId: 'mem_harbor_admin',
    })

    const harbor = getScopedPractitioners(data, data.context)
    expect(harbor.every((p) => p.organizationId === 'org_harbor')).toBe(true)
    expect(harbor.some((p) => p.organizationId === 'org_aurora')).toBe(false)
  })

  it('enables modules when a new specialty practitioner is added', () => {
    let data = resetDemoData()
    data = setTenantContext(data, {
      organizationId: 'org_harbor',
      clinicId: 'clinic_harbor_downtown',
      membershipId: 'mem_harbor_admin',
    })

    const before = getActiveModules(
      getScopedPractitioners(data, data.context),
    ).map((m) => m.id)
    expect(before).not.toContain('cardiology')

    data = upsertPractitioner(data, data.context, {
      fullName: 'Dr. New Cardio',
      email: 'cardio@harbor.demo',
      phone: '+92 306 555 0999',
      specialties: ['cardiology'],
      active: true,
    })

    const after = getActiveModules(
      getScopedPractitioners(data, data.context),
    ).map((m) => m.id)
    expect(after).toContain('cardiology')
  })

  it('rejects cross-tenant practitioner edits', () => {
    const data = resetDemoData()
    expect(() =>
      upsertPractitioner(data, data.context, {
        id: 'prac_h1',
        fullName: 'Hacked',
        email: 'x@y.com',
        phone: '1',
        specialties: ['dentistry'],
        active: true,
      }),
    ).toThrow(/Tenant isolation/)
  })

  it('stores regional and governance settings on one organization only', () => {
    const data = resetDemoData()
    const updated = updateOrganizationSettings(data, data.context, {
      regionalSettings: {
        countryCode: 'AE',
        locale: 'en-AE',
        currency: 'AED',
        defaultTimeZone: 'Asia/Dubai',
        callingCode: '+971',
      },
      governanceSettings: {
        policyProfileIds: ['privacy-baseline'],
        dataResidencyRegion: 'me-central',
        recordRetentionDays: 3650,
        requireMfa: true,
        auditTrailRequired: true,
        consentTrackingRequired: true,
      },
    })

    expect(
      updated.organizations.find((org) => org.id === 'org_aurora')
        ?.regionalSettings.countryCode,
    ).toBe('AE')
    expect(
      updated.organizations.find((org) => org.id === 'org_harbor')
        ?.regionalSettings.countryCode,
    ).toBe('PK')
  })

  it('bulk imports doctors across accessible clinics in one organization', () => {
    const data = resetDemoData()
    const updated = importPractitioners(data, data.context, [
      {
        clinicId: 'clinic_aurora_main',
        fullName: 'Dr. Main',
        email: 'main@example.com',
        phone: '+92 300 000 0001',
        specialties: ['general_medicine'],
        active: true,
      },
      {
        clinicId: 'clinic_aurora_east',
        fullName: 'Dr. East',
        email: 'east@example.com',
        phone: '+92 300 000 0002',
        specialties: ['cardiology'],
        active: true,
      },
    ])

    expect(
      updated.practitioners.filter((item) =>
        ['main@example.com', 'east@example.com'].includes(item.email),
      ),
    ).toHaveLength(2)
  })

  it('rejects bulk import into another organization clinic', () => {
    const data = resetDemoData()
    expect(() =>
      importPractitioners(data, data.context, [
        {
          clinicId: 'clinic_harbor_downtown',
          fullName: 'Dr. Wrong Tenant',
          email: 'wrong@example.com',
          phone: '+92 300 000 0003',
          specialties: ['dentistry'],
          active: true,
        },
      ]),
    ).toThrow(/Tenant isolation/)
  })
})
