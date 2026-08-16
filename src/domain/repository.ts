import { DEMO_DATA } from './seed'
import type {
  AppData,
  Clinic,
  Patient,
  Practitioner,
  PractitionerImportInput,
  GovernanceSettings,
  RegionalSettings,
  SpecialtyId,
  TenantContext,
} from './types'
import { modulesForSpecialties } from './specialtyRegistry'

const STORAGE_KEY =
  import.meta.env.VITE_STORAGE_KEY?.trim() || 'clinic-hub-demo-v5'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function readRaw(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return clone(DEMO_DATA)
    return JSON.parse(raw) as AppData
  } catch {
    return clone(DEMO_DATA)
  }
}

function writeRaw(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

function assertTenantMatch(
  organizationId: string,
  clinicId: string,
  entityOrgId: string,
  entityClinicId?: string,
): void {
  if (entityOrgId !== organizationId) {
    throw new Error('Tenant isolation violation: organization mismatch')
  }
  if (entityClinicId && entityClinicId !== clinicId) {
    throw new Error('Tenant isolation violation: clinic mismatch')
  }
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`
}

export function loadAppData(): AppData {
  return readRaw()
}

export function resetDemoData(): AppData {
  const data = clone(DEMO_DATA)
  writeRaw(data)
  return data
}

export function saveAppData(data: AppData): void {
  writeRaw(data)
}

export function getClinicsForOrg(
  data: AppData,
  organizationId: string,
): Clinic[] {
  return data.clinics.filter((c) => c.organizationId === organizationId)
}

export function getScopedPractitioners(
  data: AppData,
  context: TenantContext,
): Practitioner[] {
  return data.practitioners.filter(
    (p) =>
      p.organizationId === context.organizationId &&
      p.clinicId === context.clinicId,
  )
}

export function getScopedPatients(
  data: AppData,
  context: TenantContext,
): Patient[] {
  return data.patients.filter(
    (p) =>
      p.organizationId === context.organizationId &&
      p.clinicId === context.clinicId,
  )
}

export function getActiveSpecialtyIds(
  practitioners: Practitioner[],
): SpecialtyId[] {
  return [
    ...new Set(
      practitioners
        .filter((p) => p.active)
        .flatMap((p) => p.specialties),
    ),
  ]
}

export function getActiveModules(practitioners: Practitioner[]) {
  return modulesForSpecialties(getActiveSpecialtyIds(practitioners))
}

export function upsertPractitioner(
  data: AppData,
  context: TenantContext,
  input: Omit<Practitioner, 'id' | 'organizationId' | 'clinicId'> & {
    id?: string
  },
): AppData {
  const next = clone(data)

  if (input.id) {
    const index = next.practitioners.findIndex((p) => p.id === input.id)
    if (index < 0) throw new Error('Practitioner not found')
    const existing = next.practitioners[index]
    assertTenantMatch(
      context.organizationId,
      context.clinicId,
      existing.organizationId,
      existing.clinicId,
    )
    next.practitioners[index] = {
      ...existing,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      specialties: [...new Set(input.specialties)],
      active: input.active,
      professionalSummary: input.professionalSummary?.trim() || undefined,
      qualifications: input.qualifications?.map((item) => item.trim()).filter(Boolean),
      languages: input.languages?.map((item) => item.trim()).filter(Boolean),
      availabilitySummary: input.availabilitySummary?.trim() || undefined,
      acceptingPatients: input.acceptingPatients ?? false,
    }
  } else {
    next.practitioners.push({
      id: createId('prac'),
      organizationId: context.organizationId,
      clinicId: context.clinicId,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      specialties: [...new Set(input.specialties)],
      active: input.active,
      professionalSummary: input.professionalSummary?.trim() || undefined,
      qualifications: input.qualifications?.map((item) => item.trim()).filter(Boolean),
      languages: input.languages?.map((item) => item.trim()).filter(Boolean),
      availabilitySummary: input.availabilitySummary?.trim() || undefined,
      acceptingPatients: input.acceptingPatients ?? false,
    })
  }

  writeRaw(next)
  return next
}

export function importPractitioners(
  data: AppData,
  context: TenantContext,
  inputs: PractitionerImportInput[],
): AppData {
  const next = clone(data)
  const membership = next.memberships.find(
    (item) =>
      item.id === context.membershipId &&
      item.organizationId === context.organizationId,
  )
  if (!membership) throw new Error('Organization membership not found')

  const allowedClinicIds = new Set(
    next.clinics
      .filter(
        (clinic) =>
          clinic.organizationId === context.organizationId &&
          membership.clinicIds.includes(clinic.id),
      )
      .map((clinic) => clinic.id),
  )
  const knownEmails = new Set(
    next.practitioners
      .filter(
        (practitioner) =>
          practitioner.organizationId === context.organizationId,
      )
      .map((practitioner) => practitioner.email.trim().toLowerCase()),
  )

  for (const input of inputs) {
    if (!allowedClinicIds.has(input.clinicId)) {
      throw new Error('Tenant isolation violation: clinic is not accessible')
    }
    const email = input.email.trim().toLowerCase()
    if (knownEmails.has(email)) {
      throw new Error(`Duplicate practitioner email: ${input.email}`)
    }
    knownEmails.add(email)
    next.practitioners.push({
      id: createId('prac'),
      organizationId: context.organizationId,
      clinicId: input.clinicId,
      fullName: input.fullName.trim(),
      email: input.email.trim(),
      phone: input.phone.trim(),
      specialties: [...new Set(input.specialties)],
      active: input.active,
      professionalSummary: input.professionalSummary?.trim() || undefined,
      qualifications: input.qualifications?.map((item) => item.trim()).filter(Boolean),
      languages: input.languages?.map((item) => item.trim()).filter(Boolean),
      availabilitySummary: input.availabilitySummary?.trim() || undefined,
      acceptingPatients: input.acceptingPatients ?? false,
    })
  }

  writeRaw(next)
  return next
}

export function upsertPatient(
  data: AppData,
  context: TenantContext,
  input: Omit<Patient, 'id' | 'organizationId' | 'clinicId'> & {
    id?: string
  },
): AppData {
  const next = clone(data)

  if (input.id) {
    const index = next.patients.findIndex((p) => p.id === input.id)
    if (index < 0) throw new Error('Patient not found')
    const existing = next.patients[index]
    assertTenantMatch(
      context.organizationId,
      context.clinicId,
      existing.organizationId,
      existing.clinicId,
    )
    next.patients[index] = {
      ...existing,
      fullName: input.fullName.trim(),
      dateOfBirth: input.dateOfBirth,
      phone: input.phone.trim(),
      assignedPractitionerId: input.assignedPractitionerId,
      notes: input.notes?.trim() || undefined,
    }
  } else {
    next.patients.push({
      id: createId('pat'),
      organizationId: context.organizationId,
      clinicId: context.clinicId,
      fullName: input.fullName.trim(),
      dateOfBirth: input.dateOfBirth,
      phone: input.phone.trim(),
      assignedPractitionerId: input.assignedPractitionerId,
      notes: input.notes?.trim() || undefined,
    })
  }

  writeRaw(next)
  return next
}

export function updateOrganizationSettings(
  data: AppData,
  context: TenantContext,
  input: {
    regionalSettings: RegionalSettings
    governanceSettings: GovernanceSettings
  },
): AppData {
  const next = clone(data)
  const index = next.organizations.findIndex(
    (organization) => organization.id === context.organizationId,
  )
  if (index < 0) throw new Error('Organization not found')

  next.organizations[index] = {
    ...next.organizations[index],
    regionalSettings: { ...input.regionalSettings },
    governanceSettings: {
      ...input.governanceSettings,
      policyProfileIds: [...new Set(input.governanceSettings.policyProfileIds)],
    },
  }
  writeRaw(next)
  return next
}

export function setTenantContext(
  data: AppData,
  patch: Partial<TenantContext>,
): AppData {
  const next = clone(data)
  const organizationId = patch.organizationId ?? next.context.organizationId
  const membership =
    next.memberships.find(
      (m) =>
        m.id === (patch.membershipId ?? next.context.membershipId) &&
        m.organizationId === organizationId,
    ) ?? next.memberships.find((m) => m.organizationId === organizationId)

  if (!membership) {
    throw new Error('No membership available for organization')
  }

  const clinics = getClinicsForOrg(next, organizationId).filter((c) =>
    membership.clinicIds.includes(c.id),
  )
  const preferredClinicId = patch.clinicId ?? next.context.clinicId
  const clinicId =
    clinics.find((c) => c.id === preferredClinicId)?.id ?? clinics[0]?.id

  if (!clinicId) {
    throw new Error('No clinic available for membership')
  }

  next.context = {
    organizationId,
    clinicId,
    membershipId: membership.id,
  }
  writeRaw(next)
  return next
}
