import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { PublicTenantProvider, usePublicTenant } from './PublicTenantContext'

function TenantProbe() {
  const { organization, clinic } = usePublicTenant()
  return (
    <div>
      <span data-testid="organization">{organization?.name ?? 'Not found'}</span>
      <span data-testid="clinic">{clinic?.name ?? 'No clinic'}</span>
    </div>
  )
}

describe('PublicTenantProvider', () => {
  it('resolves public tenancy without an admin tenant context', () => {
    render(
      <MemoryRouter initialEntries={['/?host=lassanipolyclinic.com']}>
        <Routes>
          <Route
            path="/"
            element={
              <PublicTenantProvider>
                <TenantProbe />
              </PublicTenantProvider>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByTestId('organization')).toHaveTextContent('Lasaani Poly Clinic')
    expect(screen.getByTestId('clinic')).toHaveTextContent('Lasaani Poly Clinic')
  })
})
