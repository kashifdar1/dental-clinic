import { UserManager, WebStorageStateStore } from 'oidc-client-ts'

export type IdentityRealm = 'tenant' | 'platform'

export interface OidcClientConfig {
  realm: IdentityRealm
  authority?: string
  clientId?: string
  redirectUri?: string
  apiBaseUrl?: string
}

export interface IdentitySession {
  subject: string
  realm: IdentityRealm
  email?: string
  mfaVerified: boolean
  tenants?: Array<{
    tenantId: string
    name: string
    slug: string
    roles: string[]
  }>
}

export class BrowserIdentityClient {
  private readonly manager?: UserManager
  private readonly apiBaseUrl: string
  private initialization?: Promise<IdentitySession | null>

  constructor(private readonly config: OidcClientConfig) {
    this.apiBaseUrl = (config.apiBaseUrl ?? '').replace(/\/$/, '')
    if (config.authority && config.clientId && config.redirectUri) {
      this.manager = new UserManager({
        authority: config.authority,
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        response_type: 'code',
        scope: 'openid profile email',
        userStore: new WebStorageStateStore({ store: window.sessionStorage }),
        stateStore: new WebStorageStateStore({ store: window.sessionStorage }),
        automaticSilentRenew: false,
        monitorSession: false,
      })
    }
  }

  get configured(): boolean {
    return this.manager !== undefined
  }

  async signIn(): Promise<void> {
    if (!this.manager) throw new Error('Identity provider is not configured')
    await this.manager.signinRedirect()
  }

  initialize(): Promise<IdentitySession | null> {
    this.initialization ??= this.initializeOnce()
    return this.initialization
  }

  private async initializeOnce(): Promise<IdentitySession | null> {
    if (this.manager && this.isCallback()) {
      const user = await this.manager.signinCallback()
      if (!user?.access_token) throw new Error('Identity provider returned no access token')
      const response = await fetch(this.url(`/auth/${this.config.realm}/session`), {
        method: 'POST',
        credentials: 'include',
        headers: { authorization: `Bearer ${user.access_token}` },
      })
      await this.manager.removeUser()
      if (!response.ok) throw new Error(`Session exchange failed (${response.status})`)
      window.history.replaceState({}, document.title, window.location.pathname)
    }

    const response = await fetch(this.url(`/auth/${this.config.realm}/session`), {
      credentials: 'include',
    })
    if (response.status === 401) return null
    if (!response.ok) throw new Error(`Session lookup failed (${response.status})`)
    const session = (await response.json()) as IdentitySession

    if (this.config.realm === 'platform') {
      const authorized = await fetch(this.url('/v1/platform/me'), {
        credentials: 'include',
      })
      if (authorized.status === 403) throw new Error('Platform staff access is not active')
      if (!authorized.ok) throw new Error(`Platform access check failed (${authorized.status})`)
    } else {
      const tenantsResponse = await fetch(this.url('/v1/tenant/tenants'), {
        credentials: 'include',
      })
      if (!tenantsResponse.ok) throw new Error(`Tenant lookup failed (${tenantsResponse.status})`)
      session.tenants = (await tenantsResponse.json()) as IdentitySession['tenants']
    }
    return session
  }

  async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = new Headers(init.headers)
    if (!['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      const csrfToken = this.readCsrfCookie()
      if (!csrfToken) throw new Error('CSRF token is unavailable')
      headers.set('x-csrf-token', csrfToken)
    }
    if (init.body && !headers.has('content-type')) {
      headers.set('content-type', 'application/json')
    }

    const response = await fetch(this.url(path), {
      ...init,
      method,
      headers,
      credentials: 'include',
    })
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string }
      throw new Error(body.error ?? `Request failed (${response.status})`)
    }
    if (response.status === 204) return undefined as T
    return response.json() as Promise<T>
  }

  async signOut(): Promise<void> {
    const csrfToken = this.readCsrfCookie()
    if (csrfToken) {
      await fetch(this.url(`/auth/${this.config.realm}/session`), {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'x-csrf-token': csrfToken },
      })
    }
    await this.manager?.removeUser()
  }

  private url(path: string): string {
    return `${this.apiBaseUrl}${path}`
  }

  private isCallback(): boolean {
    const query = new URLSearchParams(window.location.search)
    return query.has('code') || query.has('error')
  }

  private readCsrfCookie(): string | undefined {
    const securePrefix = window.location.protocol === 'https:' ? '__Host-' : ''
    const name = `${securePrefix}clinic_${this.config.realm}_csrf`
    const entry = document.cookie
      .split('; ')
      .find((cookie) => cookie.startsWith(`${name}=`))
    return entry ? decodeURIComponent(entry.slice(name.length + 1)) : undefined
  }
}
