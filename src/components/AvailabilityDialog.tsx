import { useEffect, useId, useRef, useState } from 'react'
import {
  DEFAULT_AVAILABILITY,
  MINUTE_OPTIONS,
  WEEK_DAYS,
  formatAvailability,
  fromTimeParts,
  toTimeParts,
  validateAvailability,
  type Meridiem,
} from '../domain/availability'
import type { AvailabilityWindow } from '../domain/types'

interface Props {
  value: AvailabilityWindow | null
  onCancel: () => void
  onSave: (value: AvailabilityWindow) => void
}

const HOUR_OPTIONS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]

export function AvailabilityDialog({ value, onCancel, onSave }: Props) {
  const titleId = useId()
  const dialogRef = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<AvailabilityWindow>(
    value ?? DEFAULT_AVAILABILITY,
  )
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (typeof dialog.showModal === 'function') {
      dialog.showModal()
    } else {
      dialog.setAttribute('open', '')
    }
    dialogRef.current?.querySelector<HTMLElement>('button, select')?.focus()
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close()
    }
  }, [])

  function toggleDay(day: number) {
    setError(null)
    setDraft((current) => ({
      ...current,
      days: current.days.includes(day)
        ? current.days.filter((item) => item !== day)
        : [...current.days, day],
    }))
  }

  function updateTime(
    field: 'startTime' | 'endTime',
    patch: Partial<{ hour: number; minute: string; meridiem: Meridiem }>,
  ) {
    setError(null)
    setDraft((current) => ({
      ...current,
      [field]: fromTimeParts({ ...toTimeParts(current[field]), ...patch }),
    }))
  }

  function submit() {
    const message = validateAvailability(draft)
    if (message) {
      setError(message)
      return
    }
    onSave(draft)
  }

  const start = toTimeParts(draft.startTime)
  const end = toTimeParts(draft.endTime)
  const preview = formatAvailability(draft)

  return (
    <dialog
      className="modal"
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault()
        onCancel()
      }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel()
      }}
    >
      <div className="modal-header">
        <h2 id={titleId}>Public availability</h2>
        <button
          className="btn ghost"
          type="button"
          onClick={onCancel}
          aria-label="Close availability picker"
        >
          ✕
        </button>
      </div>

        <div className="field">
          <label id={`${titleId}-days`}>Days of the week</label>
          <div className="day-toggle-grid" role="group" aria-labelledby={`${titleId}-days`}>
            {WEEK_DAYS.map((day) => {
              const selected = draft.days.includes(day.value)
              return (
                <button
                  key={day.value}
                  type="button"
                  className={`day-toggle${selected ? ' selected' : ''}`}
                  aria-pressed={selected}
                  onClick={() => toggleDay(day.value)}
                >
                  {day.short}
                </button>
              )
            })}
          </div>
        </div>

        <div className="time-range">
          <fieldset className="time-group">
            <legend>From</legend>
            <select
              aria-label="Opening hour"
              value={start.hour}
              onChange={(event) =>
                updateTime('startTime', { hour: Number(event.target.value) })
              }
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <select
              aria-label="Opening minute"
              value={start.minute}
              onChange={(event) =>
                updateTime('startTime', { minute: event.target.value })
              }
            >
              {MINUTE_OPTIONS.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
            <select
              aria-label="Opening meridiem"
              value={start.meridiem}
              onChange={(event) =>
                updateTime('startTime', {
                  meridiem: event.target.value as Meridiem,
                })
              }
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </fieldset>

          <fieldset className="time-group">
            <legend>To</legend>
            <select
              aria-label="Closing hour"
              value={end.hour}
              onChange={(event) =>
                updateTime('endTime', { hour: Number(event.target.value) })
              }
            >
              {HOUR_OPTIONS.map((hour) => (
                <option key={hour} value={hour}>
                  {hour}
                </option>
              ))}
            </select>
            <select
              aria-label="Closing minute"
              value={end.minute}
              onChange={(event) =>
                updateTime('endTime', { minute: event.target.value })
              }
            >
              {MINUTE_OPTIONS.map((minute) => (
                <option key={minute} value={minute}>
                  {minute}
                </option>
              ))}
            </select>
            <select
              aria-label="Closing meridiem"
              value={end.meridiem}
              onChange={(event) =>
                updateTime('endTime', {
                  meridiem: event.target.value as Meridiem,
                })
              }
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
          </fieldset>
        </div>

        <p className="availability-preview" aria-live="polite">
          {preview || 'Select the days this doctor sees patients.'}
        </p>

        {error ? (
          <p className="form-error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="btn-row modal-actions">
          <button className="btn" type="button" onClick={submit}>
            Save availability
          </button>
          <button className="btn secondary" type="button" onClick={onCancel}>
            Cancel
          </button>
        </div>
    </dialog>
  )
}
