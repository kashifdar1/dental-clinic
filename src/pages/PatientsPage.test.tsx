import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { TenantProvider, useTenant } from '../domain/TenantContext'
import { resetDemoData } from '../domain/repository'
import { PatientsPage } from './PatientsPage'

function renderPage() {
  function ClinicSwitcher() {
    const { switchClinic } = useTenant()
    return (
      <button type="button" onClick={() => switchClinic('clinic_aurora_east')}>
        Switch clinic
      </button>
    )
  }

  return render(
    <TenantProvider>
      <MemoryRouter>
        <ClinicSwitcher />
        <PatientsPage />
      </MemoryRouter>
    </TenantProvider>,
  )
}

describe('PatientsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('clears a patient draft when the selected clinic changes', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Full name'), 'Draft patient')
    await user.click(screen.getByRole('button', { name: 'Switch clinic' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Full name')).toHaveValue(''),
    )
  })

  it('searches, edits, and deactivates patients', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Search patients'), 'Jordan')
    expect(screen.getByText('Jordan Ellis')).toBeInTheDocument()
    expect(screen.queryByText('Aisha Rahman')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Edit' }))
    const name = screen.getByLabelText('Full name')
    await user.clear(name)
    await user.type(name, 'Jordan Updated')
    await user.click(screen.getByRole('button', { name: 'Save changes' }))
    expect(await screen.findByText('Jordan Updated')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Deactivate' }))
    await waitFor(() =>
      expect(screen.queryByText('Jordan Updated')).not.toBeInTheDocument(),
    )

    await user.click(screen.getByRole('checkbox', { name: 'Show inactive' }))
    expect(await screen.findByText('Jordan Updated')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Reactivate' })).toBeInTheDocument()
  })
})