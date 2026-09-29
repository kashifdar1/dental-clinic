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
  resetDemoData,
  setTenantContext,
  updateClinicRouting,
  updateOrganizationSettings,
  upsertPatient,
  upsertPractitioner,
} from './repository'
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
  savePractitioner: (
    input: Omit<Practitioner, 'id' | 'organizationId' | 'clinicId'> & {
      id?: string
    },
  ) => MutationResult
  bulkImportPractitioners: (inputs: PractitionerImportInput[]) => MutationResult
  savePatient: (
    input: Omit<Patient, 'id' | 'organizationId' | 'clinicId'> & {
      id?: string
    },
  ) => MutationResult
  saveOrganizationSettings: (input: {
    hostingSettings: HostingSettings
    regionalSettings: RegionalSettings
    governanceSettings: GovernanceSettings
  }) => MutationResult
  saveClinicRouting: (input: {
    cityCode: string
    branchCode: string
    slug: string
  }) => MutationResult
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
  const scoped = useMemo(() => resolveScoped(data), [data])

  const applyMutation = useCallback(
    (mutation: (current: AppData) => AppData): MutationResult => {
      let result: MutationResult = { ok: true }
      setData((current) => {
        try {
          return mutation(current)
        } catch (error) {
          result = {
            ok: false,
            message: error instanceof Error ? error.message : 'Unable to save changes',
          }
          return current
        }
      })
      return result
    },
    [],
  )

  const switchOrganization = useCallback((organizationId: string) => {
    setData((current) => setTenantContext(current, { organizationId }))
  }, [])

  const switchClinic = useCallback((clinicId: string) => {
    setData((current) => setTenantContext(current, { clinicId }))
  }, [])

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
    setData(resetDemoData())
  }, [])

  const value: TenantState = {
    data,
    ...scoped,
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
