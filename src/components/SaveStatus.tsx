import type { MutationResult } from '../domain/TenantContext'

interface SaveStatusProps {
  status: 'idle' | 'saving' | 'error'
  result: MutationResult | null
}

export function SaveStatus({ status, result }: SaveStatusProps) {
  if (result && !result.ok) {
    return (
      <div className="import-message error-chip save-status" role="alert">
        {result.message}
      </div>
    )
  }

  if (result?.ok) {
    return (
      <div className="import-message save-status" role="status" aria-live="polite">
        Saved
      </div>
    )
  }

  if (status === 'saving') {
    return (
      <div className="import-message save-status" role="status" aria-live="polite">
        Saving changes...
      </div>
    )
  }

  return null
}
