import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { TenantProvider, useTenant } from '../domain/TenantContext'
import { resetDemoData } from '../domain/repository'
import { PractitionersPage } from './PractitionersPage'

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
        <PractitionersPage />
      </MemoryRouter>
    </TenantProvider>,
  )
}

describe('PractitionersPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('alerts when a practitioner has no specialty selected', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.type(screen.getByLabelText('Full name'), 'Dr. Unassigned')
    await user.type(screen.getByLabelText('Email'), 'unassigned@example.com')
    await user.type(screen.getByLabelText('Phone'), '+92 300 000 0000')
    await user.click(screen.getByRole('button', { name: 'Add doctor' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Select at least one specialty.',
    )
    expect(screen.queryByText('Dr. Unassigned')).not.toBeInTheDocument()
  })

  it('clears an edit form when the selected clinic changes', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getAllByRole('button', { name: 'Edit' })[0])
    expect(screen.getByLabelText('Full name')).toHaveValue('Dr. Syed Imran Garderzi')

    await user.click(screen.getByRole('button', { name: 'Switch clinic' }))

    await waitFor(() =>
      expect(screen.getByLabelText('Full name')).toHaveValue(''),
    )
    expect(screen.getByRole('heading', { name: 'Add practitioner' })).toBeInTheDocument()
  })
})