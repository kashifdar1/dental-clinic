import { useEffect, useState, type FormEvent } from 'react'
import { SaveStatus } from '../components/SaveStatus'
import type { MutationResult } from '../domain/TenantContext'
import { POLICY_PROFILES } from '../domain/policyRegistry'
import { useTenant } from '../domain/TenantContext'

export function OrganizationSettingsPage() {
  const {
    organization,
    clinic,
    status,
    saveOrganizationSettings,
    saveClinicRouting,
  } = useTenant()
  const [hosting, setHosting] = useState(organization.hostingSettings)
  const [clinicRouting, setClinicRouting] = useState({
    cityCode: clinic.cityCode,
    branchCode: clinic.branchCode,
    slug: clinic.slug,
    phone: clinic.phone ?? '',
    email: clinic.email ?? '',
    address: clinic.address ?? '',
    hours: clinic.hours ?? '',
    mapUrl: clinic.mapUrl ?? '',
  })
  const [regional, setRegional] = useState(organization.regionalSettings)
  const [governance, setGovernance] = useState(
    organization.governanceSettings,
  )
  const [result, setResult] = useState<MutationResult | null>(null)

  const hostingMode = organization.hostingSettings.mode
  const primaryDomain = organization.hostingSettings.primaryDomain
  const cityCode = clinic.cityCode
  const branchCode = clinic.branchCode
  const clinicSlug = clinic.slug
  const clinicPhone = clinic.phone ?? ''
  const clinicEmail = clinic.email ?? ''
  const clinicAddress = clinic.address ?? ''
  const clinicHours = clinic.hours ?? ''
  const clinicMapUrl = clinic.mapUrl ?? ''
  const countryCode = organization.regionalSettings.countryCode
  const locale = organization.regionalSettings.locale
  const currency = organization.regionalSettings.currency
  const defaultTimeZone = organization.regionalSettings.defaultTimeZone
  const callingCode = organization.regionalSettings.callingCode
  const policyProfileIds = organization.governanceSettings.policyProfileIds.join('|')
  const dataResidencyRegion = organization.governanceSettings.dataResidencyRegion
  const recordRetentionDays = organization.governanceSettings.recordRetentionDays
  const requireMfa = organization.governanceSettings.requireMfa
  const auditTrailRequired = organization.governanceSettings.auditTrailRequired
  const consentTrackingRequired = organization.governanceSettings.consentTrackingRequired

  useEffect(() => {
    setHosting({ mode: hostingMode, primaryDomain })
    setClinicRouting({
      cityCode,
      branchCode,
      slug: clinicSlug,
      phone: clinicPhone,
      email: clinicEmail,
      address: clinicAddress,
      hours: clinicHours,
      mapUrl: clinicMapUrl,
    })
    setRegional({
      countryCode,
      locale,
      currency,
      defaultTimeZone,
      callingCode,
    })
    setGovernance({
      policyProfileIds: policyProfileIds ? policyProfileIds.split('|') : [],
      dataResidencyRegion,
      recordRetentionDays,
      requireMfa,
      auditTrailRequired,
      consentTrackingRequired,
    })
    setResult(null)
  }, [
    auditTrailRequired,
    branchCode,
    callingCode,
    cityCode,
    clinic.id,
    clinicSlug,
    clinicPhone,
    clinicEmail,
    clinicAddress,
    clinicHours,
    clinicMapUrl,
    consentTrackingRequired,
    countryCode,
    currency,
    dataResidencyRegion,
    defaultTimeZone,
    hostingMode,
    locale,
    organization.id,
    policyProfileIds,
    primaryDomain,
    recordRetentionDays,
    requireMfa,
  ])

  function togglePolicy(id: string) {
    setGovernance((current) => ({
      ...current,
      policyProfileIds: current.policyProfileIds.includes(id)
        ? current.policyProfileIds.filter((item) => item !== id)
        : [...current.policyProfileIds, id],
    }))
  }

  async function submit(event: FormEvent) {
    event.preventDefault()
    setResult(null)
    const organizationResult = await saveOrganizationSettings({
      hostingSettings: hosting,
      regionalSettings: regional,
      governanceSettings: governance,
    })
    if (!organizationResult.ok) {
      setResult(organizationResult)
      return
    }
    const clinicResult = await saveClinicRouting(clinicRouting)
    if (!clinicResult.ok) {
      setResult(clinicResult)
      return
    }
    setResult({ ok: true })
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>Organization settings</h1>
          <p>
            Region and governance are tenant configuration—not market-specific
            application logic.
          </p>
        </div>
      </div>

      <form className="grid" onSubmit={submit}>
        <section className="panel">
          <h2>Public website hosting</h2>
          <p className="muted settings-help">
            A standalone clinic uses its domain root. Multi-clinic
            organizations use city and branch routes under one domain.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="hostingMode">Hosting mode</label>
              <select
                id="hostingMode"
                value={hosting.mode}
                onChange={(event) =>
                  setHosting({
                    ...hosting,
                    mode: event.target.value as
                      | 'standalone'
                      | 'multi_clinic',
                  })
                }
              >
                <option value="standalone">Standalone clinic</option>
                <option value="multi_clinic">Multi-clinic organization</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="primaryDomain">Primary domain</label>
              <input
                id="primaryDomain"
                value={hosting.primaryDomain}
                onChange={(event) =>
                  setHosting({
                    ...hosting,
                    primaryDomain: event.target.value,
                  })
                }
                placeholder="exampleclinic.com"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="cityCode">Selected clinic city code</label>
              <input
                id="cityCode"
                value={clinicRouting.cityCode}
                onChange={(event) =>
                  setClinicRouting({
                    ...clinicRouting,
                    cityCode: event.target.value,
                  })
                }
                placeholder="lhr"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="branchCode">Selected clinic branch code</label>
              <input
                id="branchCode"
                value={clinicRouting.branchCode}
                onChange={(event) =>
                  setClinicRouting({
                    ...clinicRouting,
                    branchCode: event.target.value,
                  })
                }
                placeholder="01"
                required
              />
            </div>
            <div className="field full">
              <label htmlFor="clinicSlug">Selected clinic slug</label>
              <input
                id="clinicSlug"
                value={clinicRouting.slug}
                onChange={(event) =>
                  setClinicRouting({
                    ...clinicRouting,
                    slug: event.target.value,
                  })
                }
                placeholder="gulberg"
                required
              />
            </div>
            <div className="field">
              <label htmlFor="clinicPhone">Clinic phone</label>
              <input
                id="clinicPhone"
                value={clinicRouting.phone}
                onChange={(event) =>
                  setClinicRouting({ ...clinicRouting, phone: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="clinicEmail">Clinic email</label>
              <input
                id="clinicEmail"
                type="email"
                value={clinicRouting.email}
                onChange={(event) =>
                  setClinicRouting({ ...clinicRouting, email: event.target.value })
                }
              />
            </div>
            <div className="field full">
              <label htmlFor="clinicAddress">Clinic address</label>
              <input
                id="clinicAddress"
                value={clinicRouting.address}
                onChange={(event) =>
                  setClinicRouting({ ...clinicRouting, address: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="clinicHours">Clinic hours</label>
              <input
                id="clinicHours"
                value={clinicRouting.hours}
                onChange={(event) =>
                  setClinicRouting({ ...clinicRouting, hours: event.target.value })
                }
              />
            </div>
            <div className="field">
              <label htmlFor="clinicMapUrl">Map URL</label>
              <input
                id="clinicMapUrl"
                type="url"
                value={clinicRouting.mapUrl}
                onChange={(event) =>
                  setClinicRouting({ ...clinicRouting, mapUrl: event.target.value })
                }
              />
            </div>
            <div className="full import-message">
              Public URL:{' '}
              <strong>
                https://{hosting.primaryDomain}
                {hosting.mode === 'multi_clinic'
                  ? `/${clinicRouting.cityCode || 'city'}/${
                      clinicRouting.branchCode || 'branch'
                    }`
                  : '/'}
              </strong>
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Regional configuration</h2>
          <p className="muted settings-help">
            Uses standard ISO, BCP 47, and IANA values so another market can be
            enabled without a code change.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="country">Country code (ISO 3166-1)</label>
              <input
                id="country"
                maxLength={2}
                value={regional.countryCode}
                onChange={(event) =>
                  setRegional({
                    ...regional,
                    countryCode: event.target.value.toUpperCase(),
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="locale">Locale (BCP 47)</label>
              <input
                id="locale"
                value={regional.locale}
                onChange={(event) =>
                  setRegional({ ...regional, locale: event.target.value })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency (ISO 4217)</label>
              <input
                id="currency"
                maxLength={3}
                value={regional.currency}
                onChange={(event) =>
                  setRegional({
                    ...regional,
                    currency: event.target.value.toUpperCase(),
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="callingCode">Calling code</label>
              <input
                id="callingCode"
                value={regional.callingCode}
                onChange={(event) =>
                  setRegional({ ...regional, callingCode: event.target.value })
                }
                required
              />
            </div>
            <div className="field full">
              <label htmlFor="timezone">Default timezone (IANA)</label>
              <input
                id="timezone"
                value={regional.defaultTimeZone}
                onChange={(event) =>
                  setRegional({
                    ...regional,
                    defaultTimeZone: event.target.value,
                  })
                }
                required
              />
            </div>
          </div>
        </section>

        <section className="panel">
          <h2>Governance configuration</h2>
          <p className="muted settings-help">
            These values describe required controls. They do not certify legal
            compliance; production services must enforce and audit them.
          </p>
          <div className="form-grid">
            <div className="field">
              <label htmlFor="residency">Data residency region</label>
              <input
                id="residency"
                value={governance.dataResidencyRegion}
                onChange={(event) =>
                  setGovernance({
                    ...governance,
                    dataResidencyRegion: event.target.value,
                  })
                }
                required
              />
            </div>
            <div className="field">
              <label htmlFor="retention">Record retention (days)</label>
              <input
                id="retention"
                type="number"
                min={1}
                value={governance.recordRetentionDays}
                onChange={(event) =>
                  setGovernance({
                    ...governance,
                    recordRetentionDays: Number(event.target.value),
                  })
                }
                required
              />
            </div>
            <fieldset className="field full">
              <legend>Policy profiles</legend>
              <div className="checklist">
                {POLICY_PROFILES.map((profile) => (
                  <label key={profile.id}>
                    <input
                      type="checkbox"
                      checked={governance.policyProfileIds.includes(profile.id)}
                      onChange={() => togglePolicy(profile.id)}
                    />
                    <span>
                      <strong>{profile.label}</strong> — {profile.jurisdiction}
                      <span className="muted"> · {profile.description}</span>
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <div className="field full checklist">
              <label>
                <input
                  type="checkbox"
                  checked={governance.requireMfa}
                  onChange={(event) =>
                    setGovernance({
                      ...governance,
                      requireMfa: event.target.checked,
                    })
                  }
                />
                Require multi-factor authentication
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={governance.auditTrailRequired}
                  onChange={(event) =>
                    setGovernance({
                      ...governance,
                      auditTrailRequired: event.target.checked,
                    })
                  }
                />
                Require an audit trail
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={governance.consentTrackingRequired}
                  onChange={(event) =>
                    setGovernance({
                      ...governance,
                      consentTrackingRequired: event.target.checked,
                    })
                  }
                />
                Require consent tracking
              </label>
            </div>
          </div>
        </section>

        <div className="btn-row">
          <button className="btn" type="submit">
            Save organization settings
          </button>
        </div>
        <SaveStatus status={status} result={result} />
      </form>
    </div>
  )
}
