import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { createAppointmentRequest, loadAppData } from '../domain/repository'
import { LocalStorageStore } from '../domain/store'
import {
  resolvePublicTenant,
  type ResolvedPublicTenant,
} from '../domain/publicTenantResolver'
import type { AppData, Clinic, Organization } from '../domain/types'
import {
  getStoredUiLanguage,
  storeUiLanguage,
  type UiLanguage,
} from '../domain/uiStrings'

interface PublicTenantState {
  data: AppData
  organization?: Organization
  clinic?: Clinic
  submitAppointmentRequest: (input: {
    practitionerId: string
    patientName: string
    phone: string
    email?: string
    preferredDay?: number
    message?: string
  }) => Promise<PublicMutationResult>
  uiLanguage: UiLanguage
  languagePromptOpen: boolean
  selectUiLanguage: (language: UiLanguage) => void
  reopenLanguagePrompt: () => void
}

export type PublicMutationResult =
  | { ok: true }
  | { ok: false; message: string }

const PublicTenantContext = createContext<PublicTenantState | null>(null)

export function PublicTenantProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { organizationSlug, cityCode, branchCode } = useParams()
  const [data, setData] = useState<AppData>(() => loadAppData())
  const [uiLanguage, setUiLanguage] = useState<UiLanguage>(
    () => getStoredUiLanguage() ?? 'en',
  )
  const [languagePromptOpen, setLanguagePromptOpen] = useState(false)
  const store = useMemo(() => new LocalStorageStore(), [])
  const tenant: ResolvedPublicTenant | null = useMemo(() => {
    const hostname = window.location.hostname
    const hostOverride = new URLSearchParams(location.search).get('host')
    return resolvePublicTenant(data, {
      hostname,
      hostOverride,
      organizationSlug,
      cityCode,
      branchCode,
      fallbackOrganizationId: data.organizations[0]?.id,
    })
  }, [branchCode, cityCode, data, location.search, organizationSlug])
  const organization = tenant?.organization
  const clinic = tenant?.clinic

  useEffect(() => {
    if (organization?.regionalSettings.countryCode === 'PK' && !getStoredUiLanguage()) {
      setLanguagePromptOpen(true)
    }
  }, [organization?.id, organization?.regionalSettings.countryCode])

  const selectUiLanguage = useCallback((language: UiLanguage) => {
    storeUiLanguage(language)
    setUiLanguage(language)
    setLanguagePromptOpen(false)
  }, [])

  const submitAppointmentRequest = useCallback(
    async (input: {
      practitionerId: string
      patientName: string
      phone: string
      email?: string
      preferredDay?: number
      message?: string
    }): Promise<PublicMutationResult> => {
      if (!organization || !clinic) {
        return { ok: false, message: 'Clinic is not available' }
      }
      try {
        const next = createAppointmentRequest(data, {
          ...input,
          organizationId: organization.id,
          clinicId: clinic.id,
        })
        next.auditEvents.push({
          id: `audit_${crypto.randomUUID().slice(0, 8)}`,
          organizationId: organization.id,
          clinicId: clinic.id,
          membershipId: 'public',
          action: 'appointment_request.created',
          occurredAt: new Date().toISOString(),
        })
        await store.save(next)
        setData(next)
        return { ok: true }
      } catch (caught) {
        return {
          ok: false,
          message: caught instanceof Error ? caught.message : 'Unable to submit request',
        }
      }
    },
    [clinic, data, organization, store],
  )

  const value = useMemo(
    () => ({
      data,
      organization,
      clinic,
      submitAppointmentRequest,
      uiLanguage,
      languagePromptOpen,
      selectUiLanguage,
      reopenLanguagePrompt: () => setLanguagePromptOpen(true),
    }),
    [
      clinic,
      data,
      languagePromptOpen,
      organization,
      selectUiLanguage,
      submitAppointmentRequest,
      uiLanguage,
    ],
  )

  return (
    <PublicTenantContext.Provider value={value}>
      {children}
    </PublicTenantContext.Provider>
  )
}

// oxlint-disable-next-line react/only-export-components -- provider and hook share one private context
export function usePublicTenant(): PublicTenantState {
  const context = useContext(PublicTenantContext)
  if (!context) {
    throw new Error('usePublicTenant must be used within PublicTenantProvider')
  }
  return context
}
