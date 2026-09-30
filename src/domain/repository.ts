import { DEMO_DATA } from './seed'
import type {
  AppData,
  Clinic,
  Patient,
  Practitioner,
  SpecialtyId,
  TenantContext,
} from './types'
import { modulesForSpecialties } from './specialtyRegistry'
import { migrate } from './schema'
export {
  createClinic,
  createVisitNote,
  createAppointmentRequest,
  importPractitioners,
  setTenantContext,
  updateClinicRouting,
  updateAppointmentRequestStatus,
  updateOrganizationSettings,
  upsertPatient,
  upsertPractitioner,
} from './reducers'

const STORAGE_KEY =
  import.meta.env.VITE_STORAGE_KEY?.trim() || 'clinic-hub-demo-v7'

function clone<T>(value: T): T {
  return structuredClone(value)
}

function readRaw(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return clone(DEMO_DATA)
    return migrate(JSON.parse(raw))
  } catch {
    return clone(DEMO_DATA)
  }
}

function writeRaw(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
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
  writeRaw(migrate(data))
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
