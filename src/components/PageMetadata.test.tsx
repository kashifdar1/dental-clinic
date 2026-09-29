import { render, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { usePageMetadata } from './PageMetadata'

function MetadataProbe() {
  usePageMetadata('Doctor profile', 'Find this doctor at the clinic.')
  return null
}

describe('usePageMetadata', () => {
  it('updates the document title and description', async () => {
    document.title = 'Clinic Hub'
    const meta = document.querySelector('meta[name="description"]')
    const previousDescription = meta?.getAttribute('content')

    const { unmount } = render(<MetadataProbe />)

    await waitFor(() => {
      expect(document.title).toBe('Doctor profile')
      expect(
        document.querySelector('meta[name="description"]')?.getAttribute('content'),
      ).toBe('Find this doctor at the clinic.')
    })

    unmount()
    expect(document.title).toBe('Clinic Hub')
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(
      previousDescription,
    )
  })
})