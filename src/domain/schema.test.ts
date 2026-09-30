import { beforeEach, describe, expect, it } from 'vitest'
import { DEMO_DATA } from './seed'
import { migrate, CURRENT_SCHEMA_VERSION } from './schema'
import { loadAppData } from './repository'

describe('app data schema', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('migrates legacy data without a schema version', () => {
    const legacy = structuredClone(DEMO_DATA) as unknown as Record<string, unknown>
    delete legacy.schemaVersion

    const migrated = migrate(legacy)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.context).toEqual(DEMO_DATA.context)
  })

  it('falls back to seed data when persisted data is malformed', () => {
    localStorage.setItem('clinic-hub-demo-v7', JSON.stringify({ patients: [] }))

    expect(loadAppData()).toEqual(DEMO_DATA)
  })

  it('rejects unsupported schema versions', () => {
    expect(() => migrate({ ...DEMO_DATA, schemaVersion: 99 })).toThrow(
      'Unsupported app data schema version: 99',
    )
  })

  it('migrates version 2 data with an empty audit log', () => {
    const versionTwo = structuredClone(DEMO_DATA) as unknown as Record<string, unknown>
    versionTwo.schemaVersion = 2
    delete versionTwo.auditEvents

    const migrated = migrate(versionTwo)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.auditEvents).toEqual([])
  })

  it('migrates version 3 data with an empty visit-note log', () => {
    const versionThree = structuredClone(DEMO_DATA) as unknown as Record<string, unknown>
    versionThree.schemaVersion = 3
    delete versionThree.visitNotes

    const migrated = migrate(versionThree)

    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION)
    expect(migrated.visitNotes).toEqual([])
  })
})
