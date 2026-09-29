import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_DATA } from './seed'
import { upsertPractitioner } from './reducers'

function cloneDemo() {
  return structuredClone(DEMO_DATA)
}

describe('pure reducers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('returns updated data without writing to localStorage', () => {
    const data = cloneDemo()

    const next = upsertPractitioner(data, data.context, {
      fullName: 'Dr. Reducer Only',
      email: 'reducer@example.com',
      phone: '+92 300 000 0000',
      specialties: ['dentistry'],
      active: true,
    })

    expect(next.practitioners).toHaveLength(data.practitioners.length + 1)
    expect(localStorage.getItem('clinic-hub-demo-v7')).toBeNull()
  })
})
