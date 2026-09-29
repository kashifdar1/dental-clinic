import { beforeEach, describe, expect, it } from 'vitest'
import { LocalStorageStore } from './store'
import { resetDemoData } from './repository'

describe('LocalStorageStore', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('loads and saves app data through the store boundary', async () => {
    resetDemoData()
    const store = new LocalStorageStore()
    const data = await store.load()
    const next = structuredClone(data)
    next.context = {
      ...next.context,
      clinicId: 'clinic_aurora_east',
    }

    await store.save(next)

    await expect(store.load()).resolves.toMatchObject({
      context: { clinicId: 'clinic_aurora_east' },
    })
  })
})
