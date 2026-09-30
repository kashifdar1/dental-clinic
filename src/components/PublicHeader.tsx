import { Link } from 'react-router-dom'
import { getUiStrings } from '../domain/uiStrings'
import type { Organization } from '../domain/types'

export function PublicHeader({
  organization,
  homePath,
}: {
  organization: Organization
  homePath: string
}) {
  const strings = getUiStrings(organization.regionalSettings.locale)
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
        <a href={`${homePath}#doctors`}>{strings.ourDoctors}</a>
        <a href={`${homePath}#contact`}>{strings.contact}</a>
      </nav>
    </header>
  )
}
