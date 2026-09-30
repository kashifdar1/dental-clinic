import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  getActiveModules,
  getClinicsForOrg,
  getScopedPatients,
  getScopedPractitioners,
  importPractitioners,
  loadAppData,
  setTenantContext,
  updateAppointmentRequestStatus,
  updateClinicRouting,
  updateOrganizationSettings,
  upsertPatient,
  upsertPractitioner,
} from './repository'
import { DEMO_DATA } from './seed'
import { LocalStorageStore } from './store'
import type {
  AppData,
  AppointmentRequest,
  AppointmentRequestStatus,
  Clinic,
  GovernanceSettings,
  HostingSettings,
  Membership,
  Organization,
  Patient,
  Practitioner,
  PractitionerImportInput,
  RegionalSettings,
  SpecialtyModule,
} from './types'

export type MutationResult =
  | { ok: true }
  | { ok: false; message: string }

interface TenantState {
  data: AppData
  organization: Organization
  clinic: Clinic
  membership: Membership
  clinics: Clinic[]
  practitioners: Practitioner[]
  patients: Patient[]
  appointmentRequests: AppointmentRequest[]
  activeModules: SpecialtyModule[]
  switchOrganization: (organizationId: string) => void
  switchClinic: (clinicId: string) => void
  status: 'idle' | 'saving' | 'error'
  error: string | null
  savePractitioner: (
    input: Omit<Practitioner, 'id' | 'organizationId' | 'clinicId'> & {
      id?: string
    },
  ) => Promise<MutationResult>
  bulkImportPractitioners: (inputs: PractitionerImportInput[]) => Promise<MutationResult>
  savePatient: (
    input: Omit<Patient, 'id' | 'organizationId' | 'clinicId'> & {
      id?: string
    },
  ) => Promise<MutationResult>
  saveOrganizationSettings: (input: {
    hostingSettings: HostingSettings
    regionalSettings: RegionalSettings
    governanceSettings: GovernanceSettings
  }) => Promise<MutationResult>
  saveClinicRouting: (input: {
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
  }) => Promise<MutationResult>
  updateAppointmentRequestStatus: (
    requestId: string,
    status: AppointmentRequestStatus,
  ) => Promise<MutationResult>
  resetDemo: () => void
}

const TenantContext = createContext<TenantState | null>(null)

function resolveScoped(data: AppData) {
  const organization = data.organizations.find(
    (o) => o.id === data.context.organizationId,
  )
  const clinic = data.clinics.find((c) => c.id === data.context.clinicId)
  const membership = data.memberships.find(
    (m) => m.id === data.context.membershipId,
  )

  if (!organization || !clinic || !membership) {
    throw new Error('Invalid tenant context')
  }

  const clinics = getClinicsForOrg(data, organization.id).filter((c) =>
    membership.clinicIds.includes(c.id),
  )
  const practitioners = getScopedPractitioners(data, data.context)
  const patients = getScopedPatients(data, data.context)
  const appointmentRequests = data.appointmentRequests.filter(
    (request) =>
      request.organizationId === data.context.organizationId &&
      request.clinicId === data.context.clinicId,
  )
  const activeModules = getActiveModules(practitioners)

  return {
    organization,
    clinic,
    membership,
    clinics,
    practitioners,
    patients,
    appointmentRequests,
    activeModules,
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadAppData())
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const store = useMemo(() => new LocalStorageStore(), [])
  const dataRef = useRef(data)
  const scoped = useMemo(() => resolveScoped(data), [data])

  const applyMutation = useCallback(
    async (
      mutation: (current: AppData) => AppData,
      action: string,
    ): Promise<MutationResult> => {
      setStatus('saving')
      setError(null)
      try {
        const next = mutation(dataRef.current)
        next.auditEvents.push({
          id: `audit_${crypto.randomUUID().slice(0, 8)}`,
          organizationId: dataRef.current.context.organizationId,
          clinicId: dataRef.current.context.clinicId,
          membershipId: dataRef.current.context.membershipId,
          action,
          occurredAt: new Date().toISOString(),
        })
        await store.save(next)
        dataRef.current = next
        setData(next)
        setStatus('idle')
        return { ok: true }
      } catch (caught) {
        const message =
          caught instanceof Error ? caught.message : 'Unable to save changes'
        setStatus('error')
        setError(message)
        return { ok: false, message }
      }
    },
    [store],
  )

  const switchOrganization = useCallback((organizationId: string) => {
    void applyMutation((current) => setTenantContext(current, { organizationId }), 'tenant.organization_switched')
  }, [applyMutation])

  const switchClinic = useCallback((clinicId: string) => {
    void applyMutation((current) => setTenantContext(current, { clinicId }), 'tenant.clinic_switched')
  }, [applyMutation])

  const savePractitioner = useCallback(
    (
      input: Omit<Practitioner, 'id' | 'organizationId' | 'clinicId'> & {
        id?: string
      },
    ) => {
      return applyMutation((current) =>
        upsertPractitioner(current, current.context, input),
        input.id ? 'practitioner.updated' : 'practitioner.created',
      )
    },
    [applyMutation],
  )

  const savePatient = useCallback(
    (
      input: Omit<Patient, 'id' | 'organizationId' | 'clinicId'> & {
        id?: string
      },
    ) => {
      return applyMutation((current) =>
        upsertPatient(current, current.context, input),
        input.id ? 'patient.updated' : 'patient.created',
      )
    },
    [applyMutation],
  )

  const bulkImportPractitioners = useCallback(
    (inputs: PractitionerImportInput[]) => {
      return applyMutation((current) =>
        importPractitioners(current, current.context, inputs),
        'practitioner.bulk_imported',
      )
    },
    [applyMutation],
  )

  const saveOrganizationSettings = useCallback(
    (input: {
      hostingSettings: HostingSettings
      regionalSettings: RegionalSettings
      governanceSettings: GovernanceSettings
    }) => {
      return applyMutation((current) =>
        updateOrganizationSettings(current, current.context, input),
        'organization.settings_updated',
      )
    },
    [applyMutation],
  )

  const saveClinicRouting = useCallback(
    (input: { cityCode: string; branchCode: string; slug: string }) => {
      return applyMutation((current) =>
        updateClinicRouting(current, current.context, input),
        'clinic.profile_updated',
      )
    },
    [applyMutation],
  )

  const resetDemo = useCallback(() => {
    void applyMutation(() => structuredClone(DEMO_DATA), 'demo.reset')
  }, [applyMutation])

  const changeAppointmentRequestStatus = useCallback(
    (requestId: string, nextStatus: AppointmentRequestStatus) =>
      applyMutation((current) =>
        updateAppointmentRequestStatus(
          current,
          current.context,
          requestId,
          nextStatus,
        ),
        'appointment_request.status_updated',
      ),
    [applyMutation],
  )

  const value: TenantState = {
    data,
    ...scoped,
    status,
    error,
    switchOrganization,
    switchClinic,
    savePractitioner,
    bulkImportPractitioners,
    savePatient,
    saveOrganizationSettings,
    saveClinicRouting,
    resetDemo,
    updateAppointmentRequestStatus: changeAppointmentRequestStatus,
  }

  return (
    <TenantContext.Provider value={value}>{children}</TenantContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components -- provider and hook share one private context
export function useTenant(): TenantState {
  const ctx = useContext(TenantContext)
  if (!ctx) {
    throw new Error('useTenant must be used within TenantProvider')
  }
  return ctx
}
