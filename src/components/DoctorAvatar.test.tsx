import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { DoctorAvatar } from './DoctorAvatar'
import type { Practitioner } from '../domain/types'

const practitioner: Practitioner = {
  id: 'prac_test',
  organizationId: 'org_test',
  clinicId: 'clinic_test',
  fullName: 'Dr. Jane Doe',
  email: 'jane@example.com',
  phone: '+1 555 0100',
  specialties: ['dentistry'],
  active: true,
}

describe('DoctorAvatar', () => {
  it('shows initials when no photo is configured', () => {
    render(<DoctorAvatar practitioner={practitioner} />)
    expect(screen.getByLabelText('Dr. Jane Doe')).toHaveTextContent('JD')
  })

  it('renders a configured photo', () => {
    render(
      <DoctorAvatar
        practitioner={{ ...practitioner, photoUrl: '/doctor.jpg' }}
      />,
    )
    expect(screen.getByAltText('Dr. Jane Doe profile')).toHaveAttribute(
      'src',
      '/doctor.jpg',
    )
  })
})