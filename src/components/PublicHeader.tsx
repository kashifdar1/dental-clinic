import { Link } from 'react-router-dom'
import type { Organization } from '../domain/types'

export function PublicHeader({
  organization,
  homePath,
}: {
  organization: Organization
  homePath: string
}) {
  return (
    <header className="public-header">
      <Link className="public-brand" to={homePath}>
        <span className="public-brand-mark" aria-hidden="true">
          +
        </span>
        <span>
          <strong>{organization.name}</strong>
          <small>Care across specialties</small>
        </span>
      </Link>
      <nav className="public-nav" aria-label="Public navigation">
        <Link to={`${homePath}#doctors`}>Our doctors</Link>
        <Link to={`${homePath}#contact`}>Contact</Link>
        <Link className="btn secondary" to="/admin">
          Admin portal
        </Link>
      </nav>
    </header>
  )
}
