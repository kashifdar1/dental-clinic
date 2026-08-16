import type { RegionalSettings } from './types'

export function formatDate(
  value: string,
  settings: RegionalSettings,
): string {
  const date = new Date(`${value}T00:00:00`)
  if (Number.isNaN(date.getTime())) return value

  return new Intl.DateTimeFormat(settings.locale, {
    dateStyle: 'medium',
    timeZone: settings.defaultTimeZone,
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
