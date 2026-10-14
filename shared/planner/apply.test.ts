import { describe, expect, it } from 'vitest'
import type { Workspace } from './model.js'
import { applyPlan, setOrderStatus } from './apply.js'
import { orderCoverage, rehearse } from './plan.js'
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

describe('closing an order', () => {
  // North Hub has 14 cases; Common Ground Cafe's 18-case order is the first one due.
  it('a cancelled order stops counting: the others get its stock, and North Hub keeps all 14', () => {
    const next = setOrderStatus(sampleWorkspace, 'ORD-1082', 'cancelled', SAMPLE_NOW)
    expect(rehearse(next).impact.affectedOrderIds).not.toContain('ORD-1082')
    expect(next.stock.find((record) => record.locationId === 'north')?.available.value).toBe(14)
    expect(orderCoverage(next).find((line) => line.orderId === 'ORD-1086')?.covered).toBe(12)
  })

  it('a delivered order takes its goods off the warehouse stock, and reopening puts them back', () => {
    const quiet: Workspace = { ...sampleWorkspace, disruptions: [], shipments: [], orders: [{ ...sampleWorkspace.orders[0], lines: [{ productId: 'harbor-blend', quantity: 5 }] }] }
    const delivered = setOrderStatus(quiet, 'ORD-1082', 'delivered', SAMPLE_NOW)
    expect(delivered.stock.find((record) => record.locationId === 'north')?.available.value).toBe(9)
    expect(orderCoverage(delivered)).toEqual([])
    const reopened = setOrderStatus(delivered, 'ORD-1082', 'open', SAMPLE_NOW)
    expect(reopened.stock.find((record) => record.locationId === 'north')?.available.value).toBe(14)
  })
})
