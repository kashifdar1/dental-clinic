import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it } from 'vitest'
import { TenantProvider } from '../domain/TenantContext'
import { resetDemoData } from '../domain/repository'
import { LoginPage } from './LoginPage'

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('offers a seeded membership picker', async () => {
    const user = userEvent.setup()
    render(
      <TenantProvider>
        <MemoryRouter>
          <LoginPage />
        </MemoryRouter>
      </TenantProvider>,
    )

    expect(screen.getByLabelText('Choose membership')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Continue to admin' }))
  })
})