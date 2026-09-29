import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { TenantProvider } from '../domain/TenantContext'
import { resetDemoData } from '../domain/repository'
import { PractitionersPage } from './PractitionersPage'

function renderPage() {
  return render(
    <TenantProvider>
      <MemoryRouter>
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
})