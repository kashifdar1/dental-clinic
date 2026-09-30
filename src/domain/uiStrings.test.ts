import { describe, expect, it } from 'vitest'
import { getUiStrings } from './uiStrings'

describe('UI strings', () => {
  it('selects Urdu strings for Urdu locales and English otherwise', () => {
    expect(getUiStrings('ur-PK').ourDoctors).toBe('ہمارے ڈاکٹرز')
    expect(getUiStrings('en-PK').ourDoctors).toBe('Our doctors')
  })
})
