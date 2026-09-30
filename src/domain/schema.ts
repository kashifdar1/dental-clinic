import type { AppData } from './types'

export const CURRENT_SCHEMA_VERSION = 3

type RecordValue = Record<string, unknown>

function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function hasStringFields(value: unknown, fields: string[]): value is RecordValue {
  return (
    isRecord(value) &&
    fields.every((field) => typeof value[field] === 'string' && value[field].length > 0)
  )
}

function isAppData(value: unknown): value is AppData {
  if (!isRecord(value) || value.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    return false
  }

  if (
    !Array.isArray(value.organizations) ||
    !Array.isArray(value.clinics) ||
    !Array.isArray(value.practitioners) ||
    !Array.isArray(value.patients) ||
    !Array.isArray(value.appointmentRequests) ||
    !Array.isArray(value.auditEvents) ||
    !Array.isArray(value.memberships) ||
    !isRecord(value.context) ||
    !hasStringFields(value.context, [
      'organizationId',
      'clinicId',
      'membershipId',
    ])
  ) {
    return false
  }

  return (
    value.organizations.every((item) =>
      hasStringFields(item, ['id', 'name', 'slug']),
    ) &&
    value.clinics.every((item) =>
      hasStringFields(item, [
        'id',
        'organizationId',
        'name',
        'city',
        'cityCode',
        'branchCode',
        'slug',
        'timezone',
      ]),
    ) &&
    value.practitioners.every((item) =>
      hasStringFields(item, [
        'id',
        'organizationId',
        'clinicId',
        'fullName',
        'email',
        'phone',
      ]),
    ) &&
    value.patients.every((item) =>
      hasStringFields(item, [
        'id',
        'organizationId',
        'clinicId',
        'fullName',
        'dateOfBirth',
        'phone',
      ]),
    ) &&
    value.appointmentRequests.every((item) =>
      hasStringFields(item, [
        'id',
        'organizationId',
        'clinicId',
        'practitionerId',
        'patientName',
        'phone',
        'status',
        'createdAt',
      ]),
    ) &&
    value.auditEvents.every((item) =>
      hasStringFields(item, [
        'id',
        'organizationId',
        'clinicId',
        'membershipId',
        'action',
        'occurredAt',
      ]),
    ) &&
    value.memberships.every((item) =>
      hasStringFields(item, [
        'id',
        'organizationId',
        'displayName',
        'email',
        'role',
      ]),
    )
  )
}

export function migrate(raw: unknown): AppData {
  if (!isRecord(raw)) {
    throw new Error('Stored app data must be an object')
  }

  let version = raw.schemaVersion ?? 0
  let migrated: RecordValue = raw
  if (version === 0) {
    version = 1
    migrated = { ...migrated, schemaVersion: version }
  }
  if (version === 1) {
    version = CURRENT_SCHEMA_VERSION
    migrated = {
      ...migrated,
      schemaVersion: version,
      appointmentRequests: [],
    }
  }
  if (version === 2) {
    version = CURRENT_SCHEMA_VERSION
    migrated = {
      ...migrated,
      schemaVersion: version,
      auditEvents: [],
    }
  }
  if (version !== CURRENT_SCHEMA_VERSION) {
    throw new Error(`Unsupported app data schema version: ${String(version)}`)
  }
  if (!isAppData(migrated)) {
    throw new Error('Stored app data failed validation')
  }

  return structuredClone(migrated)
}
