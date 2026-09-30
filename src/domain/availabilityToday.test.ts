import { describe, expect, it } from 'vitest'
import { isAvailableToday } from './availability'

describe('availability today', () => {
  it('uses the clinic timezone when resolving the weekday', () => {
    const lateUtc = new Date('2026-09-28T23:30:00.000Z')
    const mondayOnly = { days: [1], startTime: '09:00', endTime: '17:00' }

    expect(isAvailableToday(mondayOnly, 'Asia/Karachi', lateUtc)).toBe(false)
    expect(isAvailableToday(mondayOnly, 'America/Los_Angeles', lateUtc)).toBe(true)
  })
})