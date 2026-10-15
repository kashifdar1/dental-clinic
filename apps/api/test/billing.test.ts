import { describe, expect, it } from 'vitest'
import { CreatePlanSchema, combineAllowance } from '@clinic-hub/shared'

describe('plan allowances', () => {
  it('combines plan, add-on, and override allowances without going below zero', () => {
    expect(combineAllowance(2, [3, -4])).toBe(1)
    expect(combineAllowance(1, [-5])).toBe(0)
  })

  it('rejects a catalog price on a plan', () => {
    expect(CreatePlanSchema.safeParse({
      key: 'clinic-standard',
      name: 'Clinic standard',
      price: 500000,
      entitlements: [{ key: 'locations.max', limit: 1 }],
    }).success).toBe(false)
  })

  it('keeps WhatsApp template sends informational', () => {
    expect(CreatePlanSchema.safeParse({
      key: 'messages',
      name: 'Messages',
      entitlements: [{
        key: 'whatsapp.template_sends.monthly',
        includedQuantity: 10,
        overagePolicy: 'block',
      }],
    }).success).toBe(false)
  })
})
