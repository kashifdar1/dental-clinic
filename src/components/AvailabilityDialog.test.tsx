import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { AvailabilityDialog } from './AvailabilityDialog'

describe('AvailabilityDialog', () => {
  it('opens natively and saves the selected availability', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const onSave = vi.fn()
    render(
      <AvailabilityDialog
        value={null}
        onCancel={onCancel}
        onSave={onSave}
      />,
    )

    expect(screen.getByRole('dialog')).toHaveAttribute('open')
    await user.click(screen.getByRole('button', { name: 'Save availability' }))

    expect(onSave).toHaveBeenCalledWith({
      days: [1, 2, 3, 4, 5],
      startTime: '09:00',
      endTime: '17:00',
    })
    await user.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(onCancel).toHaveBeenCalled()
  })
})