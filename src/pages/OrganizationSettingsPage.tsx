import { useEffect, useState, type FormEvent } from 'react'
import { POLICY_PROFILES } from '../domain/policyRegistry'
import { useTenant } from '../domain/TenantContext'

export function OrganizationSettingsPage() {
  const { organization, saveOrganizationSettings } = useTenant()
  const [regional, setRegional] = useState(organization.regionalSettings)
  const [governance, setGovernance] = useState(
    organization.governanceSettings,
  )
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setRegional(organization.regionalSettings)
    setGovernance(organization.governanceSettings)
    setSaved(false)
  }, [organization])

  function togglePolicy(id: string) {
    setGovernance((current) => ({
      ...current,
      policyProfileIds: current.policyProfileIds.includes(id)
        ? current.policyProfileIds.filter((item) => item !== id)
        : [...current.policyProfileIds, id],
    }))
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    saveOrganizationSettings({
      regionalSettings: regional,
      governanceSettings: governance,
    })
    setSaved(true)
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
          <h2>Regional configuration</h2>
          <p className="muted" style={{ margin: '0.35rem 0 1rem' }}>
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
          <p className="muted" style={{ margin: '0.35rem 0 1rem' }}>
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
            <div className="field full">
              <label>Policy profiles</label>
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
            </div>
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
          {saved ? <span className="chip">Saved</span> : null}
        </div>
      </form>
    </div>
  )
}
