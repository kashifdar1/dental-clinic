import type { Metadata } from 'next'
import type { ReactNode } from 'react'

// oxlint-disable-next-line react/only-export-components -- Next.js reads metadata exports from the root layout.
export const metadata: Metadata = {
  title: 'Clinic Hub',
  description: 'Public clinic website service.',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
