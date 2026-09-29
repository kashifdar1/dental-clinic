import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'
import { useLocation, useParams } from 'react-router-dom'
import { loadAppData } from '../domain/repository'
import {
  resolvePublicTenant,
  type ResolvedPublicTenant,
} from '../domain/publicTenantResolver'
import type { AppData, Clinic, Organization } from '../domain/types'

interface PublicTenantState {
  data: AppData
  organization?: Organization
  clinic?: Clinic
}

const PublicTenantContext = createContext<PublicTenantState | null>(null)

export function PublicTenantProvider({ children }: { children: ReactNode }) {
  const location = useLocation()
  const { organizationSlug, cityCode, branchCode } = useParams()
  const data = useMemo(() => loadAppData(), [])
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

  const value = useMemo(
    () => ({
      data,
      organization: tenant?.organization,
      clinic: tenant?.clinic,
    }),
    [data, tenant],
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
