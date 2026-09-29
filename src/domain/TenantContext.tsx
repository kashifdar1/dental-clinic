import {
  createContext,
  useCallback,
  useContext,
  useMemo,
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
  updateClinicRouting,
  updateOrganizationSettings,
  upsertPatient,
  upsertPractitioner,
} from './repository'
import { DEMO_DATA } from './seed'
import { LocalStorageStore } from './store'
import type {
  AppData,
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
  }) => Promise<MutationResult>
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
  const activeModules = getActiveModules(practitioners)

  return {
    organization,
    clinic,
    membership,
    clinics,
    practitioners,
    patients,
    activeModules,
  }
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppData>(() => loadAppData())
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const store = useMemo(() => new LocalStorageStore(), [])
  const scoped = useMemo(() => resolveScoped(data), [data])

  const applyMutation = useCallback(
    async (mutation: (current: AppData) => AppData): Promise<MutationResult> => {
      setStatus('saving')
      setError(null)
      try {
        const next = mutation(data)
        await store.save(next)
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
    [data, store],
  )

  const switchOrganization = useCallback((organizationId: string) => {
    void applyMutation((current) => setTenantContext(current, { organizationId }))
  }, [applyMutation])

  const switchClinic = useCallback((clinicId: string) => {
    void applyMutation((current) => setTenantContext(current, { clinicId }))
  }, [applyMutation])

  const savePractitioner = useCallback(
    (
      input: Omit<Practitioner, 'id' | 'organizationId' | 'clinicId'> & {
        id?: string
      },
    ) => {
      return applyMutation((current) =>
        upsertPractitioner(current, current.context, input),
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
      )
    },
    [applyMutation],
  )

  const bulkImportPractitioners = useCallback(
    (inputs: PractitionerImportInput[]) => {
      return applyMutation((current) =>
        importPractitioners(current, current.context, inputs),
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
      )
    },
    [applyMutation],
  )

  const saveClinicRouting = useCallback(
    (input: { cityCode: string; branchCode: string; slug: string }) => {
      return applyMutation((current) =>
        updateClinicRouting(current, current.context, input),
      )
    },
    [applyMutation],
  )

  const resetDemo = useCallback(() => {
    void applyMutation(() => structuredClone(DEMO_DATA))
  }, [applyMutation])

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
