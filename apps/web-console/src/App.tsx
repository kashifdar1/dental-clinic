import { useEffect, useState, type FormEvent } from 'react'
import { BrowserIdentityClient, type IdentitySession } from '@clinic-hub/identity-client'
import './app.css'

interface Location {
  id: string
  tenant_id: string
  name: string
  slug: string
  timezone: string
}

interface Membership {
  membershipId: string
  email: string
  displayName: string
  status: string
  role?: string
  scope?: string
  locationId?: string
}

interface Invitation {
  id: string
  email: string
  role_key: string
  scope: string
  scope_location_id?: string
  expires_at: string
}

const auth = new BrowserIdentityClient({
  realm: 'tenant',
  authority: import.meta.env.VITE_TENANT_OIDC_AUTHORITY,
  clientId: import.meta.env.VITE_TENANT_OIDC_CLIENT_ID,
  redirectUri: import.meta.env.VITE_TENANT_OIDC_REDIRECT_URI || window.location.origin,
  apiBaseUrl: import.meta.env.VITE_API_BASE_URL,
})

export function App() {
  const [session, setSession] = useState<IdentitySession | null>(null)
  const [tenantId, setTenantId] = useState('')
  const [tenantRoles, setTenantRoles] = useState<string[]>([])
  const [locations, setLocations] = useState<Location[]>([])
  const [memberships, setMemberships] = useState<Membership[]>([])
  const [invitations, setInvitations] = useState<Invitation[]>([])
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [timezone, setTimezone] = useState('Asia/Karachi')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('receptionist')
  const [inviteScope, setInviteScope] = useState<'tenant' | 'location'>('tenant')
  const [inviteLocationId, setInviteLocationId] = useState('')
  const [createdToken, setCreatedToken] = useState('')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)

  async function loadLocations(selectedTenant: string) {
    setLocations(await auth.request<Location[]>('/v1/tenant/locations', {
      headers: { 'x-tenant-id': selectedTenant },
    }))
  }

  async function loadMemberships(selectedTenant: string) {
    const headers = { 'x-tenant-id': selectedTenant }
    const [nextMemberships, nextInvitations] = await Promise.all([
      auth.request<Membership[]>('/v1/tenant/memberships', { headers }),
      auth.request<Invitation[]>('/v1/tenant/invitations', { headers }),
    ])
    setMemberships(nextMemberships)
    setInvitations(nextInvitations)
  }

  async function loadTenantData(selectedTenant: string, roles: string[]) {
    setTenantId(selectedTenant)
    setTenantRoles(roles)
    setMessage('')
    try {
      setInviteLocationId('')
      setCreatedToken('')
      const requests = [loadLocations(selectedTenant)]
      if (roles.some((role) => ['tenant_owner', 'tenant_admin'].includes(role))) {
        requests.push(loadMemberships(selectedTenant))
      } else {
        setMemberships([])
        setInvitations([])
      }
      await Promise.all(requests)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to load tenant workspace')
    }
  }

  useEffect(() => {
    let active = true
    auth.initialize()
      .then((identity) => {
        if (!active) return
        setSession(identity)
        const firstTenant = identity?.tenants?.[0]?.tenantId
        const firstRoles = identity?.tenants?.[0]?.roles ?? []
        if (firstTenant) void loadTenantData(firstTenant, firstRoles)
      })
      .catch((error: unknown) => setMessage(error instanceof Error ? error.message : 'Unable to load session'))
      .finally(() => active && setLoading(false))
    return () => { active = false }
  }, [])

  async function createLocation(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      await auth.request('/v1/tenant/locations', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: JSON.stringify({ name, slug, timezone }),
      })
      setName('')
      setSlug('')
      await loadLocations(tenantId)
      setMessage('Location created.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create location')
    }
  }

  async function createInvitation(event: FormEvent) {
    event.preventDefault()
    setMessage('')
    try {
      const invitation = await auth.request<{ invitationToken: string }>('/v1/tenant/invitations', {
        method: 'POST',
        headers: { 'x-tenant-id': tenantId },
        body: JSON.stringify({
          email: inviteEmail,
          role: inviteRole,
          scope: inviteScope,
          locationId: inviteScope === 'location' ? inviteLocationId : undefined,
        }),
      })
      setCreatedToken(invitation.invitationToken)
      setInviteEmail('')
      await loadMemberships(tenantId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create invitation')
    }
  }

  async function revokeInvitation(invitationId: string) {
    setMessage('')
    try {
      await auth.request(`/v1/tenant/invitations/${invitationId}`, {
        method: 'DELETE',
        headers: { 'x-tenant-id': tenantId },
      })
      await loadMemberships(tenantId)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to revoke invitation')
    }
  }

  async function signOut() {
    await auth.signOut()
    setSession(null)
    setTenantId('')
  }

  if (loading) return <main className="tenant-page"><p>Checking tenant session…</p></main>
  if (!auth.configured) {
    return <main className="tenant-page"><h1>Tenant workspace</h1><p>OIDC authority and client ID are required.</p></main>
  }
  if (!session) {
    return <main className="tenant-page"><h1>Tenant workspace</h1><button onClick={() => void auth.signIn()}>Sign in</button>{message && <p role="alert">{message}</p>}</main>
  }

  return (
    <main className="tenant-page">
      <header className="tenant-header">
        <div><h1>Tenant workspace</h1><p>{session.email ?? session.subject}</p></div>
        <button className="quiet-button" onClick={() => void signOut()}>Sign out</button>
      </header>
      <label className="tenant-picker">Organization
        <select value={tenantId} onChange={(event) => {
          const selected = session.tenants?.find((tenant) => tenant.tenantId === event.target.value)
          if (selected) void loadTenantData(selected.tenantId, selected.roles)
        }}>
          {session.tenants?.map((tenant) => <option key={tenant.tenantId} value={tenant.tenantId}>{tenant.name}</option>)}
        </select>
      </label>
      {message && <p role="status">{message}</p>}
      <section aria-labelledby="locations-heading">
        <h2 id="locations-heading">Locations <span>{locations.length}</span></h2>
        <form className="location-form" onSubmit={createLocation}>
          <label>Name<input required minLength={2} value={name} onChange={(event) => setName(event.target.value)} /></label>
          <label>Branch slug<input required value={slug} onChange={(event) => setSlug(event.target.value)} /></label>
          <label>IANA timezone<input required value={timezone} onChange={(event) => setTimezone(event.target.value)} /></label>
          <button type="submit">Add location</button>
        </form>
        <div className="table-scroll"><table><thead><tr><th>Name</th><th>Slug</th><th>Timezone</th></tr></thead>
          <tbody>{locations.map((location) => <tr key={location.id}><td>{location.name}</td><td>{location.slug}</td><td>{location.timezone}</td></tr>)}</tbody>
        </table></div>
      </section>
      {tenantRoles.some((role) => ['tenant_owner', 'tenant_admin'].includes(role)) && <section aria-labelledby="memberships-heading">
        <h2 id="memberships-heading">Memberships <span>{memberships.length}</span></h2>
        <div className="table-scroll"><table><thead><tr><th>Member</th><th>Status</th><th>Role</th><th>Scope</th></tr></thead>
          <tbody>{memberships.map((member, index) => <tr key={`${member.membershipId}-${index}`}><td>{member.displayName}<small>{member.email}</small></td><td>{member.status}</td><td>{member.role ?? 'Unassigned'}</td><td>{member.scope ?? 'Tenant'}</td></tr>)}</tbody>
        </table></div>
      </section>
      }
      <section aria-labelledby="invitations-heading">
        <h2 id="invitations-heading">Invite management user</h2>
        <form className="location-form" onSubmit={createInvitation}>
          <label>Email<input type="email" required value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} /></label>
          <label>Role<select value={inviteRole} onChange={(event) => setInviteRole(event.target.value)}><option value="tenant_admin">Tenant admin</option><option value="location_manager">Location manager</option><option value="receptionist">Receptionist</option><option value="practitioner">Practitioner</option><option value="billing_admin">Billing admin</option><option value="content_editor">Content editor</option></select></label>
          <label>Scope<select value={inviteScope} onChange={(event) => setInviteScope(event.target.value as 'tenant' | 'location')}><option value="tenant">Tenant</option><option value="location">Location</option></select></label>
          {inviteScope === 'location' && <label>Location<select required value={inviteLocationId} onChange={(event) => setInviteLocationId(event.target.value)}><option value="">Choose location</option>{locations.map((location) => <option key={location.id} value={location.id}>{location.name}</option>)}</select></label>}
          <button type="submit">Create invitation</button>
        </form>
        {createdToken && <p role="status">Invitation token (share securely): <code>{createdToken}</code></p>}
        <div className="table-scroll"><table><thead><tr><th>Email</th><th>Role</th><th>Expires</th><th></th></tr></thead>
          <tbody>{invitations.map((invitation) => <tr key={invitation.id}><td>{invitation.email}</td><td>{invitation.role_key}</td><td>{new Date(invitation.expires_at).toLocaleDateString()}</td><td><button className="danger-button" onClick={() => void revokeInvitation(invitation.id)}>Revoke</button></td></tr>)}</tbody>
        </table></div>
      </section>
    </main>
  )
}
