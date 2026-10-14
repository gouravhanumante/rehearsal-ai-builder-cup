import { describe, expect, it } from 'vitest'
import type { Workspace } from './model.js'
import { applyPlan } from './apply.js'
import { rehearse } from './plan.js'
import { SAMPLE_NOW, sampleEvidence, sampleWorkspace } from './sample.js'

const planOf = (data: Workspace, id: string) => {
  const plan = rehearse(data).plans.find((item) => item.id === id)
  if (!plan) throw new Error(`no plan ${id}`)
  return plan
}
const exposure = (data: Workspace) => rehearse(data).impact.exposedQuantity

describe('approving a plan changes the records, so the picture stays true', () => {
  // North Hub is 24 cases short before the late delivery; South Hub has 14 and can send 8 a day.
  it('a transfer takes the stock out of South Hub now and adds it as arriving at North Hub', () => {
    const next = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    expect(next.stock.find((record) => record.locationId === 'south')?.available.value).toBe(6)
    expect(next.shipments.at(-1)).toMatchObject({ locationId: 'north', lines: [{ productId: 'harbor-blend', quantity: 8 }], supplierName: 'Transfer from South Hub' })
    expect(exposure(next)).toBe(16)
  })

  it('approving the same transfer twice is not offered: South can now spare only 6', () => {
    const next = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    expect(planOf(next, 'transfer:south-to-north:harbor-blend').quantity).toBe(6)
  })

  it('buying from a backup supplier adds their delivery, and what they offered is spoken for', () => {
    const offer = { productId: 'harbor-blend', locationId: 'north', available: { value: 20, evidence: sampleEvidence }, pricePerUnit: { value: 11, evidence: sampleEvidence }, arrivalAt: { value: '2026-10-15T11:00:00+05:30', evidence: sampleEvidence } }
    const data: Workspace = { ...sampleWorkspace, routes: [], suppliers: [{ id: 'supplier-b', name: 'Supplier B', offers: [offer] }] }
    const next = applyPlan(data, planOf(data, 'supplier:supplier-b:harbor-blend:north'), SAMPLE_NOW)
    expect(next.shipments.at(-1)).toMatchObject({ supplierName: 'Supplier B', locationId: 'north', lines: [{ quantity: 20 }] })
    expect(next.suppliers[0].offers[0].available.value).toBe(0)
    expect(exposure(next)).toBe(4)
  })
})
