export function sessionCookieName(
  realm: 'tenant' | 'platform',
  secure: boolean,
): string {
  const name = realm === 'tenant' ? 'clinic_tenant_session' : 'clinic_platform_session'
  return secure ? `__Host-${name}` : name
}

export function csrfCookieName(realm: 'tenant' | 'platform', secure: boolean): string {
  const name = realm === 'tenant' ? 'clinic_tenant_csrf' : 'clinic_platform_csrf'
  return secure ? `__Host-${name}` : name
}
