import type { AvailabilityWindow } from './types'

export type Meridiem = 'AM' | 'PM'

export interface TimeParts {
  hour: number
  minute: string
  meridiem: Meridiem
}

/** Display order starts on Monday because clinics publish weekday-first hours. */
export const WEEK_DAYS = [
  { value: 1, label: 'Monday', short: 'Mon' },
  { value: 2, label: 'Tuesday', short: 'Tue' },
  { value: 3, label: 'Wednesday', short: 'Wed' },
  { value: 4, label: 'Thursday', short: 'Thu' },
  { value: 5, label: 'Friday', short: 'Fri' },
  { value: 6, label: 'Saturday', short: 'Sat' },
  { value: 0, label: 'Sunday', short: 'Sun' },
] as const

export const MINUTE_OPTIONS = ['00', '15', '30', '45'] as const

export const DEFAULT_AVAILABILITY: AvailabilityWindow = {
  days: [1, 2, 3, 4, 5],
  startTime: '09:00',
  endTime: '17:00',
}

export function toMinutes(time: string): number {
  const [hour, minute] = time.split(':').map(Number)
  if (Number.isNaN(hour) || Number.isNaN(minute)) return Number.NaN
  return hour * 60 + minute
}

export function toTimeParts(time: string): TimeParts {
  const [rawHour, rawMinute] = time.split(':')
  const hour24 = Number(rawHour)
  const meridiem: Meridiem = hour24 >= 12 ? 'PM' : 'AM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  return { hour: hour12, minute: rawMinute ?? '00', meridiem }
}

export function fromTimeParts({ hour, minute, meridiem }: TimeParts): string {
  const base = hour % 12
  const hour24 = meridiem === 'PM' ? base + 12 : base
  return `${String(hour24).padStart(2, '0')}:${minute}`
}

export function formatTime(time: string): string {
  const { hour, minute, meridiem } = toTimeParts(time)
  return `${hour}:${minute} ${meridiem}`
}

function groupDays(days: number[]): string {
  const order = WEEK_DAYS.map((day) => day.value)
  const selected = order.filter((value) => days.includes(value))
  const groups: string[] = []
  let runStart = 0

  for (let index = 0; index < selected.length; index += 1) {
    const isLast = index === selected.length - 1
    const nextIsAdjacent =
      !isLast &&
      order.indexOf(selected[index + 1]) === order.indexOf(selected[index]) + 1

    if (!nextIsAdjacent) {
      const startDay = WEEK_DAYS.find(
        (day) => day.value === selected[runStart],
      )!
      const endDay = WEEK_DAYS.find((day) => day.value === selected[index])!
      groups.push(
        index - runStart >= 2
          ? `${startDay.label}–${endDay.label}`
          : index === runStart
            ? startDay.label
            : `${startDay.label}, ${endDay.label}`,
      )
      runStart = index + 1
    }
  }

  return groups.join(', ')
}

export function validateAvailability(window: AvailabilityWindow): string | null {
  if (window.days.length === 0) return 'Select at least one day.'
  if (toMinutes(window.endTime) <= toMinutes(window.startTime)) {
    return 'The closing time must be after the opening time.'
  }
  return null
}

export function formatAvailability(window: AvailabilityWindow): string {
  if (window.days.length === 0) return ''
  return `${groupDays(window.days)} · ${formatTime(window.startTime)}–${formatTime(
    window.endTime,
  )}`
}
