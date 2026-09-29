import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { DEMO_DATA } from '../domain/seed'
import { PublicHeader } from './PublicHeader'

describe('PublicHeader', () => {
  it('keeps public navigation separate from the admin portal', () => {
    render(
      <MemoryRouter>
        <PublicHeader
          organization={DEMO_DATA.organizations[0]}
          homePath="/"
        />
      </MemoryRouter>,
    )

    expect(screen.getByRole('link', { name: 'Our doctors' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Admin portal' })).not.toBeInTheDocument()
  })
})