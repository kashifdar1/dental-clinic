import { normalizeHostname } from './publicTenantResolver'
import type {
  AppData,
  AppointmentRequestStatus,
  Clinic,
  GovernanceSettings,
  HostingSettings,
  Patient,
  Practitioner,
  PractitionerImportInput,
  RegionalSettings,
  SpecialtyId,
  TenantContext,
} from './types'

function clone<T>(value: T): T {
  return structuredClone(value)
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

function assertUniquePractitionerEmail(
  data: AppData,
  organizationId: string,
  email: string,
  currentId?: string,
): void {
  const normalizedEmail = email.trim().toLowerCase()
  if (!normalizedEmail) throw new Error('Practitioner email is required')
  if (
    data.practitioners.some(
      (practitioner) =>
        practitioner.id !== currentId &&
        practitioner.organizationId === organizationId &&
        practitioner.email.trim().toLowerCase() === normalizedEmail,
    )
  ) {
    throw new Error(`Duplicate practitioner email: ${email}`)
  }
}

function assertAssignedPractitioner(
  data: AppData,
  context: TenantContext,
  practitionerId?: string,
): void {
  if (
    practitionerId &&
    !data.practitioners.some(
      (practitioner) =>
        practitioner.id === practitionerId &&
        practitioner.organizationId === context.organizationId &&
        practitioner.clinicId === context.clinicId,
    )
  ) {
    throw new Error('Assigned practitioner must belong to the selected clinic')
  }
}

export function createAppointmentRequest(
  data: AppData,
  input: {
    organizationId: string
    clinicId: string
    practitionerId: string
    patientName: string
    phone: string
    email?: string
    preferredDay?: number
    message?: string
  },
): AppData {
  const next = clone(data)
  const practitioner = next.practitioners.find(
    (item) =>
      item.id === input.practitionerId &&
      item.organizationId === input.organizationId &&
      item.clinicId === input.clinicId &&
      item.active,
  )
  if (!practitioner) throw new Error('Practitioner is not available at this clinic')
  if (!input.patientName.trim() || !input.phone.trim()) {
    throw new Error('Patient name and phone are required')
  }
  next.appointmentRequests.push({
    id: createId('request'),
    organizationId: input.organizationId,
    clinicId: input.clinicId,
    practitionerId: input.practitionerId,
    patientName: input.patientName.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    preferredDay: input.preferredDay,
    message: input.message?.trim() || undefined,
    status: 'new',
    createdAt: new Date().toISOString(),
  })
  return next
}

export function updateAppointmentRequestStatus(
  data: AppData,
  context: TenantContext,
  requestId: string,
  status: AppointmentRequestStatus,
): AppData {
  const next = clone(data)
  const request = next.appointmentRequests.find((item) => item.id === requestId)
  if (!request) throw new Error('Appointment request not found')
  assertTenantMatch(
    context.organizationId,
    context.clinicId,
    request.organizationId,
    request.clinicId,
  )
  request.status = status
  return next
}

export function createVisitNote(
  data: AppData,
  context: TenantContext,
  input: {
    patientId: string
    practitionerId: string
    specialtyId: SpecialtyId
    content: string
  },
): AppData {
  const next = clone(data)
  const patient = next.patients.find(
    (item) =>
      item.id === input.patientId &&
      item.organizationId === context.organizationId &&
      item.clinicId === context.clinicId,
  )
  const practitioner = next.practitioners.find(
    (item) =>
      item.id === input.practitionerId &&
      item.organizationId === context.organizationId &&
      item.clinicId === context.clinicId &&
      item.active &&
      item.specialties.includes(input.specialtyId),
  )
  if (!patient) throw new Error('Patient does not belong to the selected clinic')
  if (!practitioner) throw new Error('Practitioner is not assigned to this specialty')
  if (!input.content.trim()) throw new Error('Visit note content is required')

  next.visitNotes.push({
    id: createId('visit'),
    organizationId: context.organizationId,
    clinicId: context.clinicId,
    patientId: input.patientId,
    practitionerId: input.practitionerId,
    specialtyId: input.specialtyId,
    content: input.content.trim(),
    createdAt: new Date().toISOString(),
  })
  return next
}

export function upsertPractitioner(
  data: AppData,
  context: TenantContext,
  input: Omit<Practitioner, 'id' | 'organizationId' | 'clinicId'> & {
    id?: string
  },
): AppData {
  const next = clone(data)
  assertUniquePractitionerEmail(next, context.organizationId, input.email, input.id)

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
      availability: input.availability,
      availabilitySummary: input.availability
        ? undefined
        : input.availabilitySummary?.trim() || undefined,
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
      availability: input.availability,
      availabilitySummary: input.availability
        ? undefined
        : input.availabilitySummary?.trim() || undefined,
      acceptingPatients: input.acceptingPatients ?? false,
    })
  }

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
      availability: input.availability,
      availabilitySummary: input.availability
        ? undefined
        : input.availabilitySummary?.trim() || undefined,
      acceptingPatients: input.acceptingPatients ?? false,
    })
  }

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
  assertAssignedPractitioner(next, context, input.assignedPractitionerId)

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
      active: input.active ?? true,
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
      active: input.active ?? true,
    })
  }

  return next
}

export function createClinic(
  data: AppData,
  context: TenantContext,
  input: {
    name: string
    city: string
    cityCode: string
    branchCode: string
    slug: string
    timezone: string
    phone?: string
    email?: string
  },
): AppData {
  const next = clone(data)
  const membership = next.memberships.find((item) => item.id === context.membershipId)
  if (!membership || membership.organizationId !== context.organizationId) {
    throw new Error('Organization membership not found')
  }
  const name = input.name.trim()
  const city = input.city.trim()
  const cityCode = input.cityCode.trim().toLowerCase()
  const branchCode = input.branchCode.trim().toLowerCase()
  const slug = input.slug.trim().toLowerCase()
  const timezone = input.timezone.trim()
  if (!name || !city || !cityCode || !branchCode || !slug || !timezone) {
    throw new Error('Clinic name, location, route, and timezone are required')
  }
  if (
    next.clinics.some(
      (clinic) =>
        clinic.organizationId === context.organizationId &&
        clinic.cityCode.toLowerCase() === cityCode &&
        clinic.branchCode.toLowerCase() === branchCode,
    )
  ) {
    throw new Error('Clinic route is already assigned')
  }
  if (
    next.clinics.some(
      (clinic) =>
        clinic.organizationId === context.organizationId &&
        clinic.slug.toLowerCase() === slug,
    )
  ) {
    throw new Error('Clinic slug is already assigned')
  }

  const clinicId = createId('clinic')
  next.clinics.push({
    id: clinicId,
    organizationId: context.organizationId,
    name,
    city,
    cityCode,
    branchCode,
    slug,
    timezone,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
  })
  membership.clinicIds = [...new Set([...membership.clinicIds, clinicId])]
  return next
}

export function updateOrganizationSettings(
  data: AppData,
  context: TenantContext,
  input: {
    hostingSettings: HostingSettings
    regionalSettings: RegionalSettings
    governanceSettings: GovernanceSettings
  },
): AppData {
  const next = clone(data)
  const index = next.organizations.findIndex(
    (organization) => organization.id === context.organizationId,
  )
  if (index < 0) throw new Error('Organization not found')
  const primaryDomain = normalizeHostname(input.hostingSettings.primaryDomain)
  if (!primaryDomain) throw new Error('Primary domain is required')
  if (
    next.organizations.some(
      (organization) =>
        organization.id !== context.organizationId &&
        normalizeHostname(organization.hostingSettings.primaryDomain) ===
          primaryDomain,
    )
  ) {
    throw new Error('Primary domain is already assigned')
  }

  next.organizations[index] = {
    ...next.organizations[index],
    hostingSettings: {
      ...input.hostingSettings,
      primaryDomain,
    },
    regionalSettings: { ...input.regionalSettings },
    governanceSettings: {
      ...input.governanceSettings,
      policyProfileIds: [...new Set(input.governanceSettings.policyProfileIds)],
    },
  }
  return next
}

export function updateClinicRouting(
  data: AppData,
  context: TenantContext,
  input: {
    cityCode: string
    branchCode: string
    slug: string
    phone?: string
    email?: string
    address?: string
    hours?: string
    mapUrl?: string
    tagline?: string
    heroCopy?: string
    heroImageUrl?: string
    whatsappUrl?: string
  },
): AppData {
  const next = clone(data)
  const clinicIndex = next.clinics.findIndex(
    (clinic) =>
      clinic.id === context.clinicId &&
      clinic.organizationId === context.organizationId,
  )
  if (clinicIndex < 0) throw new Error('Clinic not found')

  const cityCode = input.cityCode.trim().toLowerCase()
  const branchCode = input.branchCode.trim().toLowerCase()
  const slug = input.slug.trim().toLowerCase()
  if (!cityCode || !branchCode || !slug) {
    throw new Error('Clinic route values are required')
  }
  if (
    next.clinics.some(
      (clinic) =>
        clinic.id !== context.clinicId &&
        clinic.organizationId === context.organizationId &&
        clinic.cityCode.toLowerCase() === cityCode &&
        clinic.branchCode.toLowerCase() === branchCode,
    )
  ) {
    throw new Error('Clinic route is already assigned')
  }
  if (
    next.clinics.some(
      (clinic) =>
        clinic.id !== context.clinicId &&
        clinic.organizationId === context.organizationId &&
        clinic.slug.toLowerCase() === slug,
    )
  ) {
    throw new Error('Clinic slug is already assigned')
  }

  next.clinics[clinicIndex] = {
    ...next.clinics[clinicIndex],
    cityCode,
    branchCode,
    slug,
    phone: input.phone?.trim() || undefined,
    email: input.email?.trim() || undefined,
    address: input.address?.trim() || undefined,
    hours: input.hours?.trim() || undefined,
    mapUrl: input.mapUrl?.trim() || undefined,
    tagline: input.tagline?.trim() || undefined,
    heroCopy: input.heroCopy?.trim() || undefined,
    heroImageUrl: input.heroImageUrl?.trim() || undefined,
    whatsappUrl: input.whatsappUrl?.trim() || undefined,
  }
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

  const clinics = next.clinics.filter(
    (clinic: Clinic) =>
      clinic.organizationId === organizationId &&
      membership.clinicIds.includes(clinic.id),
  )
  const preferredClinicId = patch.clinicId ?? next.context.clinicId
  const clinicId =
    clinics.find((clinic) => clinic.id === preferredClinicId)?.id ?? clinics[0]?.id

  if (!clinicId) {
    throw new Error('No clinic available for membership')
  }

  next.context = {
    organizationId,
    clinicId,
    membershipId: membership.id,
  }
  return next
}
