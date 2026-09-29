import type { AppData, Clinic, Organization } from './types'

export interface PublicTenantRequest {
  hostname: string
  hostOverride?: string | null
  organizationSlug?: string
  cityCode?: string
  branchCode?: string
  fallbackOrganizationId?: string
}

export interface ResolvedPublicTenant {
  organization: Organization
  clinic?: Clinic
}

export function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]
    .split(':')[0]
    .replace(/^www\./, '')
}

export function isLocalHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname)
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '0.0.0.0'
  )
}

function canOverrideHost(hostname: string): boolean {
  return (
    isLocalHostname(hostname) ||
    import.meta.env.VITE_ALLOW_HOST_OVERRIDE === 'true'
  )
}

export function resolvePublicTenant(
  data: Pick<AppData, 'organizations' | 'clinics'>,
  request: PublicTenantRequest,
): ResolvedPublicTenant | null {
  const requestedHost = normalizeHostname(
    canOverrideHost(request.hostname) && request.hostOverride
      ? request.hostOverride
      : request.hostname,
  )
  let organization = data.organizations.find(
    (item) =>
      normalizeHostname(item.hostingSettings.primaryDomain) === requestedHost,
  )

  if (!organization && request.organizationSlug) {
    organization = data.organizations.find(
      (item) => item.slug === request.organizationSlug,
    )
  }

  if (
    !organization &&
    isLocalHostname(request.hostname) &&
    request.fallbackOrganizationId
  ) {
    organization = data.organizations.find(
      (item) => item.id === request.fallbackOrganizationId,
    )
  }

  if (!organization) return null

  const organizationClinics = data.clinics.filter(
    (clinic) => clinic.organizationId === organization.id,
  )

  if (organization.hostingSettings.mode === 'standalone') {
    if (request.cityCode || request.branchCode) return null
    const clinic = organizationClinics[0]
    return clinic ? { organization, clinic } : null
  }

  if (!request.cityCode && !request.branchCode) {
    return { organization }
  }
  if (!request.cityCode || !request.branchCode) return null

  const clinic = organizationClinics.find(
    (item) =>
      item.cityCode.toLowerCase() === request.cityCode?.toLowerCase() &&
      item.branchCode.toLowerCase() === request.branchCode?.toLowerCase(),
  )
  return clinic ? { organization, clinic } : null
}

export function buildPublicPath(
  organization: Organization,
  clinic?: Clinic,
  doctorId?: string,
): string {
  let path = ''
  if (organization.hostingSettings.mode === 'multi_clinic' && clinic) {
    path = `/${clinic.cityCode}/${clinic.branchCode}`
  }
  if (doctorId) path += `/doctors/${doctorId}`
  return path || '/'
}

export function buildPublicDemoPath(
  organization: Organization,
  clinic: Clinic | undefined,
  hostname: string,
  doctorId?: string,
): string {
  const path = buildPublicPath(organization, clinic, doctorId)
  if (
    normalizeHostname(hostname) ===
    normalizeHostname(organization.hostingSettings.primaryDomain)
  ) {
    return path
  }

  if (!canOverrideHost(hostname)) return path

  const separator = path.includes('?') ? '&' : '?'
  return `${path}${separator}host=${encodeURIComponent(
    organization.hostingSettings.primaryDomain,
  )}`
}
