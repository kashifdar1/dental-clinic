import { SPECIALTY_MODULES } from '../domain/specialtyRegistry'
import type { SpecialtyId } from '../domain/types'

const PALETTES: Record<
  SpecialtyId,
  { start: string; end: string; ink: string }
> = {
  general_medicine: { start: '#d9eee6', end: '#8bb8a8', ink: '#164f42' },
  gynecology: { start: '#f2dce4', end: '#c58ca2', ink: '#73364f' },
  dentistry: { start: '#dceaf2', end: '#8eb2c8', ink: '#244f6b' },
  pediatrics: { start: '#f5e5c9', end: '#d8aa61', ink: '#80501a' },
  cardiology: { start: '#eaddec', end: '#b594bf', ink: '#60386e' },
}

const THUMBNAIL_PATHS: Partial<Record<SpecialtyId, string>> = {
  general_medicine: '/specialties/general-medicine.png',
  gynecology: '/specialties/gynecology.png',
  dentistry: '/specialties/dentistry.png',
  pediatrics: '/specialties/pediatrics.png',
  cardiology: '/specialties/cardiology.png',
}

function SpecialtyIcon({
  specialtyId,
  color,
}: {
  specialtyId: SpecialtyId
  color: string
}) {
  const common = {
    fill: 'none',
    stroke: color,
    strokeWidth: 5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }

  switch (specialtyId) {
    case 'dentistry':
      return (
        <path
          {...common}
          d="M66 40c-13 0-19 10-17 23 2 14 8 39 17 39 7 0 5-18 14-18s7 18 14 18c9 0 15-25 17-39 2-13-4-23-17-23-6 0-9 3-14 3s-8-3-14-3Z"
        />
      )
    case 'cardiology':
      return (
        <>
          <path
            {...common}
            d="M80 105S39 81 39 57c0-14 10-23 23-23 9 0 15 5 18 12 3-7 9-12 18-12 13 0 23 9 23 23 0 24-41 48-41 48Z"
          />
          <path {...common} d="M45 70h20l7-13 13 27 8-14h22" />
        </>
      )
    case 'gynecology':
      return (
        <>
          <circle {...common} cx="80" cy="56" r="24" />
          <path {...common} d="M80 80v35M65 99h30" />
          <path {...common} d="M63 51c8-8 26-8 34 0" />
        </>
      )
    case 'pediatrics':
      return (
        <>
          <circle {...common} cx="80" cy="70" r="31" />
          <circle {...common} cx="50" cy="42" r="13" />
          <circle {...common} cx="110" cy="42" r="13" />
          <circle fill={color} cx="69" cy="67" r="4" />
          <circle fill={color} cx="91" cy="67" r="4" />
          <path {...common} d="M70 84c7 6 13 6 20 0" />
        </>
      )
    case 'general_medicine':
      return (
        <>
          <path {...common} d="M55 37v29c0 17 10 28 25 28s25-11 25-28V37" />
          <path {...common} d="M45 37h20M95 37h20" />
          <circle {...common} cx="105" cy="92" r="14" />
          <path {...common} d="M94 101c-7 14-24 17-34 7" />
        </>
      )
  }
}

export function SpecialtyThumbnail({
  specialtyId,
  className = '',
}: {
  specialtyId: SpecialtyId
  className?: string
}) {
  const specialty = SPECIALTY_MODULES[specialtyId]
  const palette = PALETTES[specialtyId]
  const gradientId = `specialty-${specialtyId}`
  const thumbnailPath = THUMBNAIL_PATHS[specialtyId]

  if (thumbnailPath) {
    return (
      <img
        className={className}
        src={thumbnailPath}
        alt={`${specialty.label} illustration`}
      />
    )
  }

  return (
    <svg
      className={className}
      viewBox="0 0 160 140"
      role="img"
      aria-label={`${specialty.label} illustration`}
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={palette.start} />
          <stop offset="1" stopColor={palette.end} />
        </linearGradient>
      </defs>
      <rect width="160" height="140" fill={`url(#${gradientId})`} />
      <circle cx="132" cy="20" r="42" fill="#fff" opacity="0.16" />
      <circle cx="20" cy="130" r="52" fill="#fff" opacity="0.1" />
      <SpecialtyIcon specialtyId={specialtyId} color={palette.ink} />
    </svg>
  )
}
