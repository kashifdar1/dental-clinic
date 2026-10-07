export type IdentityProviderMode = 'local' | 'oidc'

export interface AuthenticatedIdentity {
  subject: string
  email?: string
}

export interface Authenticator {
  authenticate(accessToken: string): Promise<AuthenticatedIdentity | null>
}
