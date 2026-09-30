import type { Practitioner } from '../domain/types'
import type { SpecialtyId } from '../domain/types'
import generalMedicineBackground from '../assets/doctor-cards/general-medicine.svg'
import dentistryBackground from '../assets/doctor-cards/dentistry.svg'
import cardiologyBackground from '../assets/doctor-cards/cardiology.svg'
import gynecologyBackground from '../assets/doctor-cards/gynecology.svg'
import pediatricsBackground from '../assets/doctor-cards/pediatrics.svg'

const CARD_BACKGROUNDS: Record<SpecialtyId, string> = {
  general_medicine: generalMedicineBackground,
  dentistry: dentistryBackground,
  cardiology: cardiologyBackground,
  gynecology: gynecologyBackground,
  pediatrics: pediatricsBackground,
}

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
  specialtyId = practitioner.specialties[0] ?? 'general_medicine',
}: {
  practitioner: Practitioner
  className?: string
  specialtyId?: SpecialtyId
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
    <div
      className={`${className} doctor-avatar-fallback`}
      aria-label={practitioner.fullName}
    >
      <img
        className="doctor-avatar-background"
        src={CARD_BACKGROUNDS[specialtyId]}
        alt=""
      />
      <span>{initials(practitioner.fullName)}</span>
    </div>
  )
}