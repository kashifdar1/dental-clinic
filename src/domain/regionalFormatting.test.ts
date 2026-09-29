import { describe, expect, it } from 'vitest'
import { formatDate } from './regionalFormatting'

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