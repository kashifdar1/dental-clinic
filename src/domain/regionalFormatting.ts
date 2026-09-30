import type { RegionalSettings } from './types'

const RTL_LANGUAGE_CODES = new Set(['ar', 'fa', 'he', 'ur'])

export function getTextDirection(locale: string): 'ltr' | 'rtl' {
  return RTL_LANGUAGE_CODES.has(locale.split('-')[0].toLowerCase()) ? 'rtl' : 'ltr'
}

export function formatDate(
  value: string,
  settings: RegionalSettings,
): string {
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(settings.locale, {
    dateStyle: 'medium',
    timeZone: 'UTC',
  }).format(date)
}

export function formatCurrency(
  value: number,
  settings: RegionalSettings,
): string {
  return new Intl.NumberFormat(settings.locale, {
    style: 'currency',
    currency: settings.currency,
  }).format(value)
}
