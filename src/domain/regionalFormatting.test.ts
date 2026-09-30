import { describe, expect, it } from 'vitest'
import { formatDate, getTextDirection } from './regionalFormatting'

describe('regional text direction', () => {
  it('uses RTL for Urdu and other RTL language locales', () => {
    expect(getTextDirection('ur-PK')).toBe('rtl')
    expect(getTextDirection('ar-SA')).toBe('rtl')
    expect(getTextDirection('en-PK')).toBe('ltr')
  })
})

describe('regional date formatting', () => {
  it('preserves date-only values across organization timezones', () => {
    expect(
      formatDate('1991-04-12', {
        countryCode: 'PK',
        locale: 'en-US',
        currency: 'PKR',
        defaultTimeZone: 'America/Los_Angeles',
        callingCode: '+92',
      }),
    ).toBe('Apr 12, 1991')
  })
})