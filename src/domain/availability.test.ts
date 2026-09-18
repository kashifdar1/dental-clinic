import { describe, expect, it } from 'vitest'
import {
  formatAvailability,
  formatTime,
  fromTimeParts,
  toTimeParts,
  validateAvailability,
} from './availability'

describe('availability', () => {
  it('converts between 24h strings and 12h parts', () => {
    expect(toTimeParts('09:30')).toEqual({
      hour: 9,
      minute: '30',
      meridiem: 'AM',
    })
    expect(toTimeParts('00:15')).toEqual({
      hour: 12,
      minute: '15',
      meridiem: 'AM',
    })
    expect(toTimeParts('13:00')).toEqual({
      hour: 1,
      minute: '00',
      meridiem: 'PM',
    })
    expect(fromTimeParts({ hour: 12, minute: '45', meridiem: 'PM' })).toBe('12:45')
    expect(fromTimeParts({ hour: 12, minute: '00', meridiem: 'AM' })).toBe('00:00')
    expect(formatTime('17:00')).toBe('5:00 PM')
  })

  it('collapses consecutive days into ranges', () => {
    expect(
      formatAvailability({
        days: [1, 2, 3, 4, 5],
        startTime: '09:00',
        endTime: '14:00',
      }),
    ).toBe('Monday–Friday · 9:00 AM–2:00 PM')

    expect(
      formatAvailability({
        days: [1, 3, 5],
        startTime: '15:00',
        endTime: '19:00',
      }),
    ).toBe('Monday, Wednesday, Friday · 3:00 PM–7:00 PM')

    expect(
      formatAvailability({
        days: [1, 2, 6],
        startTime: '10:00',
        endTime: '12:30',
      }),
    ).toBe('Monday, Tuesday, Saturday · 10:00 AM–12:30 PM')
  })

  it('treats Sunday as the last day of the display week', () => {
    expect(
      formatAvailability({
        days: [0, 2, 3, 4, 5, 6],
        startTime: '12:00',
        endTime: '18:00',
      }),
    ).toBe('Tuesday–Sunday · 12:00 PM–6:00 PM')
  })

  it('rejects empty days and non-increasing ranges', () => {
    expect(
      validateAvailability({ days: [], startTime: '09:00', endTime: '17:00' }),
    ).toMatch(/at least one day/i)
    expect(
      validateAvailability({ days: [1], startTime: '17:00', endTime: '09:00' }),
    ).toMatch(/after the opening time/i)
    expect(
      validateAvailability({ days: [1], startTime: '09:00', endTime: '17:00' }),
    ).toBeNull()
  })
})
