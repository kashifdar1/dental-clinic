import { useEffect, useState, type FormEvent } from 'react'
import { BrowserIdentityClient, type IdentitySession } from '@clinic-hub/identity-client'
import './app.css'

interface TenantSummary {
  id: string
  name: string
  slug: string
  lifecycle_state: 'draft' | 'trial' | 'active' | 'past_due' | 'suspended' | 'closed'
  created_at: string
}

interface TenantAuditEvent {
  id: string
  tenantId: string
  tenantName?: string
  actorSubject: string
  action: string
  resourceType: string
  resourceId?: string
  occurredAt: string
}

interface SecurityEvent {
  id: string
  eventType: string
  actorSubject?: string
  identityRealm?: string
  requestId?: string
  occurredAt: string
}

interface SupportSnapshot {
  tenant: {
    id: string
    name: string
    slug: string
    lifecycle_state: string
  }
  locations: Array<{ id: string; name: string; slug: string; timezone: string }>
  memberships: Array<{
    membershipId: string
    email: string
    displayName: string
    status: string
    role?: string
    scope?: string
    locationId?: string
  }>
}

const auth = new BrowserIdentityClient({
  realm: 'platform',
  authority: import.meta.env.VITE_PLATFORM_OIDC_AUTHORITY,
  clientId: import.meta.env.VITE_PLATFORM_OIDC_CLIENT_ID,
  redirectUri: import.meta.env.VITE_PLATFORM_OIDC_REDIRECT_URI || window.location.origin,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
})

const transitions: Record<TenantSummary['lifecycle_state'], TenantSummary['lifecycle_state'][]> = {
  draft: ['trial', 'active', 'closed'],
  trial: ['active', 'past_due', 'suspended', 'closed'],
  active: ['past_due', 'suspended', 'closed'],
  past_due: ['active', 'suspended', 'closed'],
  suspended: ['active', 'closed'],
  closed: [],
}

export function App() {
  const [session, setSession] = useState<IdentitySession | null>(null)
  const [tenants, setTenants] = useState<TenantSummary[]>([])
  const [nextState, setNextState] = useState<Record<string, TenantSummary['lifecycle_state']>>({})
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [search, setSearch] = useState('')
  const [auditTenantId, setAuditTenantId] = useState('')
  const [tenantEvents, setTenantEvents] = useState<TenantAuditEvent[]>([])
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([])
  const [supportReason, setSupportReason] = useState('')
  const [supportSession, setSupportSession] = useState<{
    id: string
    token: string
    tenantId: string
    tenantName: string
    expiresAt: string
  } | null>(null)
  const [supportSnapshot, setSupportSnapshot] = useState<SupportSnapshot | null>(null)
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadTenants() {
    const result = await auth.request<TenantSummary[]>('/v1/platform/tenants')
    setTenants(result)
    setNextState(Object.fromEntries(result.map((tenant) => [tenant.id, tenant.lifecycle_state])))
  }

  async function loadAuditEvents(tenantId = auditTenantId) {
    const query = new URLSearchParams({ limit: '50' })
    if (tenantId) query.set('tenantId', tenantId)
    const result = await auth.request<{ tenantEvents: TenantAuditEvent[]; securityEvents: SecurityEvent[] }>(
      `/v1/platform/audit-events?${query}`,
    )
    setTenantEvents(result.tenantEvents)
    setSecurityEvents(result.securityEvents)
  }

  useEffect(() => {
    let active = true
    auth.initialize()
      .then(async (identity) => {
        if (!active) return
        setSession(identity)
        if (identity) await Promise.all([loadTenants(), loadAuditEvents('')])
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to load platform session'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  async function createTenant(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      await auth.request('/v1/platform/tenants', {
        method: 'POST',
        body: JSON.stringify({ name, slug }),
      })
      setName('')
      setSlug('')
      await loadTenants()
      setMessage('Tenant created in draft state.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create tenant')
    }
  }

  async function saveLifecycle(tenant: TenantSummary) {
    setMessage('')
    try {
      await auth.request(`/v1/platform/tenants/${tenant.id}/lifecycle`, {
        method: 'PATCH',
        body: JSON.stringify({ lifecycleState: nextState[tenant.id] }),
      })
      await loadTenants()
      setMessage(`${tenant.name} lifecycle updated.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update tenant')
    }
  }

  async function startSupportSession(tenant: TenantSummary) {
    setMessage('')
    try {
      const session = await auth.request<NonNullable<typeof supportSession>>(
        `/v1/platform/tenants/${tenant.id}/support-sessions`,
        { method: 'POST', body: JSON.stringify({ reason: supportReason }) },
      )
      setSupportSession(session)
      const snapshot = await auth.request<SupportSnapshot>(
        `/v1/platform/support-sessions/${session.id}/snapshot`,
        { headers: { 'x-support-token': session.token } },
      )
      setSupportSnapshot(snapshot)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to start support session')
    }
  }

  async function endSupportSession() {
    if (!supportSession) return
    try {
      await auth.request(`/v1/platform/support-sessions/${supportSession.id}`, {
        method: 'DELETE',
      })
      setMessage('Support session ended.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to end support session')
    } finally {
      setSupportSession(null)
      setSupportSnapshot(null)
    }
  }

  const filteredTenants = tenants.filter((tenant) =>
    `${tenant.name} ${tenant.slug} ${tenant.lifecycle_state}`
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  )

  async function signOut() {
    await auth.signOut()
    setSession(null)
    setTenants([])
  }

  if (loading) return <main className="platform-page"><p>Checking platform session…</p></main>
  if (!auth.configured) {
    return <main className="platform-page"><h1>Platform operations</h1><p>OIDC authority and client ID are required.</p></main>
  }
  if (!session) {
    return <main className="platform-page"><h1>Platform operations</h1><button onClick={() => void auth.signIn()}>Sign in</button>{message && <p role="alert">{message}</p>}</main>
  }

  return (
    <main className="platform-page">
      <header className="platform-header">
        <div><h1>Platform operations</h1><p>{session.email ?? session.subject}</p></div>
        <button className="quiet-button" onClick={() => void signOut()}>Sign out</button>
      </header>
      <section aria-labelledby="tenants-heading">
        <h2 id="tenants-heading">Tenants <span>{tenants.length}</span></h2>
        <label className="tenant-search">Search tenants<input value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <form className="tenant-create" onSubmit={createTenant}>
          <label>Organization name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Subdomain slug<input required minLength={1} value={slug} onChange={(event) => setSlug(event.target.value)} /></label>
          <button type="submit">Create draft tenant</button>
        </form>
        <label className="support-reason">Support access reason<input minLength={20} maxLength={500} value={supportReason} onChange={(event) => setSupportReason(event.target.value)} placeholder="Explain the support request (20 characters minimum)" /></label>
        {message && <p role="status">{message}</p>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>Organization</th><th>Slug</th><th>Status</th><th>Created</th><th>Change status</th></tr></thead>
            <tbody>{filteredTenants.map((tenant) => (
              <tr key={tenant.id}>
                <td>{tenant.name}</td><td>{tenant.slug}</td><td>{tenant.lifecycle_state}</td>
                <td>{new Date(tenant.created_at).toLocaleDateString()}</td>
                <td>
                  <div className="lifecycle-control">
                    <select value={nextState[tenant.id]} onChange={(event) => setNextState({ ...nextState, [tenant.id]: event.target.value as TenantSummary['lifecycle_state'] })}>
                      {[tenant.lifecycle_state, ...transitions[tenant.lifecycle_state]].map((state) => <option key={state} value={state}>{state}</option>)}
                    </select>
                    <button disabled={nextState[tenant.id] === tenant.lifecycle_state} onClick={() => void saveLifecycle(tenant)}>Save</button>
                    <button className="quiet-button" disabled={supportReason.trim().length < 20 || Boolean(supportSession)} onClick={() => void startSupportSession(tenant)}>Read-only support</button>
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
          {filteredTenants.length === 0 && <p className="empty-state">No tenants match.</p>}
        </div>
      </section>
      {supportSession && supportSnapshot && <section aria-labelledby="support-heading" className="support-panel">
        <div className="audit-heading">
          <div><h2 id="support-heading">Read-only support view: {supportSnapshot.tenant.name}</h2><p>Expires {new Date(supportSession.expiresAt).toLocaleTimeString()}</p></div>
          <button className="danger-button" onClick={() => void endSupportSession()}>End support view</button>
        </div>
        <p>Reason: {supportReason || 'Recorded with the support session'}</p>
        <h3>Locations</h3>
        <ul>{supportSnapshot.locations.map((location) => <li key={location.id}>{location.name} · {location.timezone}</li>)}</ul>
        <h3>Management memberships</h3>
        <ul>{supportSnapshot.memberships.map((member) => <li key={member.membershipId}>{member.displayName} · {member.role ?? 'No role'} · {member.status}</li>)}</ul>
      </section>}
      <section aria-labelledby="audit-heading">
        <div className="audit-heading">
          <h2 id="audit-heading">Audit events</h2>
          <label>Tenant filter<select value={auditTenantId} onChange={(event) => {
            setAuditTenantId(event.target.value)
            void loadAuditEvents(event.target.value)
          }}><option value="">All tenants</option>{tenants.map((tenant) => <option key={tenant.id} value={tenant.id}>{tenant.name}</option>)}</select></label>
          <button className="quiet-button" onClick={() => void loadAuditEvents()}>Refresh</button>
        </div>
        <div className="table-scroll"><table><thead><tr><th>Time</th><th>Tenant</th><th>Actor</th><th>Action</th><th>Resource</th></tr></thead>
          <tbody>{tenantEvents.map((event) => <tr key={event.id}><td>{new Date(event.occurredAt).toLocaleString()}</td><td>{event.tenantName ?? event.tenantId}</td><td>{event.actorSubject}</td><td>{event.action}</td><td>{event.resourceType}</td></tr>)}</tbody>
        </table></div>
        <div className="table-scroll"><table><thead><tr><th>Time</th><th>Realm</th><th>Actor</th><th>Security event</th><th>Request</th></tr></thead>
          <tbody>{securityEvents.map((event) => <tr key={event.id}><td>{new Date(event.occurredAt).toLocaleString()}</td><td>{event.identityRealm ?? 'unknown'}</td><td>{event.actorSubject ?? 'anonymous'}</td><td>{event.eventType}</td><td>{event.requestId ?? '-'}</td></tr>)}</tbody>
        </table></div>
      </section>
    </main>
  )
}
