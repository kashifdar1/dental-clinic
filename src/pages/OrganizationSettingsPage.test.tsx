import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { TenantProvider } from '../domain/TenantContext'
import { resetDemoData } from '../domain/repository'
import { OrganizationSettingsPage } from './OrganizationSettingsPage'

function renderPage() {
  return render(
    <TenantProvider>
      <MemoryRouter>
        <OrganizationSettingsPage />
      </MemoryRouter>
    </TenantProvider>,
  )
}

describe('OrganizationSettingsPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('renders duplicate domains as an inline error', async () => {
    const user = userEvent.setup()
    renderPage()

    const domain = screen.getByLabelText('Primary domain')
    await user.clear(domain)
    await user.type(domain, 'lassanipolyclinic.com')
    await user.click(screen.getByRole('button', { name: 'Save organization settings' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Primary domain is already assigned',
    )
  })

  it('keeps the saved confirmation visible after a successful save', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Save organization settings' }))

    expect(await screen.findByText('Saved')).toBeInTheDocument()
  })
})