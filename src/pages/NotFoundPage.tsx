import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="not-found">
      <div>
        <h1>Page not found</h1>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          That route is outside this clinic workspace.
        </p>
        <div className="btn-row" style={{ justifyContent: 'center', marginTop: '1.25rem' }}>
          <Link className="btn" to="/">
            Back to clinic website
          </Link>
          <Link className="btn secondary" to="/admin">
            Admin portal
          </Link>
        </div>
      </div>
    </div>
  )
}
