import type { Practitioner } from '../domain/types'

function initials(fullName: string): string {
  const words = fullName
    .replace(/^dr\.?\s+/i, '')
    .trim()
    .split(/\s+/)
  return words
    .slice(0, 2)
    .map((word) => word[0]?.toUpperCase() ?? '')
    .join('')
}

export function DoctorAvatar({
  practitioner,
  className = '',
}: {
  practitioner: Practitioner
  className?: string
}) {
  if (practitioner.photoUrl) {
    return (
      <img
        className={className}
        src={practitioner.photoUrl}
        alt={`${practitioner.fullName} profile`}
      />
    )
  }

  return (
    <div className={`${className} doctor-avatar-fallback`} aria-label={practitioner.fullName}>
      {initials(practitioner.fullName)}
    </div>
  )
}