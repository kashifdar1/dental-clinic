import { Link } from 'react-router-dom'
import type { Organization } from '../domain/types'

export function PublicHeader({ organization }: { organization: Organization }) {
  return (
    <header className="public-header">
      <Link className="public-brand" to={`/clinic/${organization.slug}`}>
        <span className="public-brand-mark" aria-hidden="true">
          +
        </span>
        <span>
          <strong>{organization.name}</strong>
          <small>Care across specialties</small>
        </span>
      </Link>
      <nav className="public-nav" aria-label="Public navigation">
        <a href="#doctors">Our doctors</a>
        <a href="#contact">Contact</a>
        <Link className="btn secondary" to="/admin">
          Admin portal
        </Link>
      </nav>
    </header>
  )
}
