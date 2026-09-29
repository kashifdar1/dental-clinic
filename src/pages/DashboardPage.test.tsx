import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TenantProvider } from '../domain/TenantContext'
import { loadAppData, resetDemoData, saveAppData } from '../domain/repository'
import { DashboardPage } from './DashboardPage'

function renderPage() {
  return render(
    <TenantProvider>
      <MemoryRouter>
        <DashboardPage />
      </MemoryRouter>
    </TenantProvider>,
  )
}

describe('DashboardPage', () => {
  beforeEach(() => {
    localStorage.clear()
    resetDemoData()
  })

  it('does not reset data when the confirmation is cancelled', async () => {
    const user = userEvent.setup()
    const data = loadAppData()
    data.organizations[0].name = 'Changed demo organization'
    saveAppData(data)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Reset demo data' }))

    expect(confirm).toHaveBeenCalledWith(
      'Reset all demo data to the original seed data?',
    )
    expect(loadAppData().organizations[0].name).toBe('Changed demo organization')
    confirm.mockRestore()
  })

  it('resets data after confirmation', async () => {
    const user = userEvent.setup()
    const data = loadAppData()
    data.organizations[0].name = 'Changed demo organization'
    saveAppData(data)
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()

    await user.click(screen.getByRole('button', { name: 'Reset demo data' }))

    expect(loadAppData().organizations[0].name).toBe(
      'Indus Hospital & Health Network',
    )
    vi.restoreAllMocks()
  })
})