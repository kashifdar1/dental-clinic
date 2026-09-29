import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="not-found">
      <div>
        <h1>Page not found</h1>
        <p className="muted stack-tight">
          That route is outside this clinic workspace.
        </p>
        <div className="btn-row center-actions stack-section">
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
