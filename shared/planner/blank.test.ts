import { describe, expect, it } from 'vitest'
import { createBlankWorkspace } from './blank.js'
import type { Order, Workspace } from './model.js'
import { rehearse } from './plan.js'
import { sampleEvidence, sampleWorkspace } from './sample.js'
import { sliceForPlan } from './slice.js'
import { LIMITS, parseWorkspace } from './validate.js'

describe('a blank workspace', () => {
  const blank = createBlankWorkspace('  Priya Traders  ', 'IN')

  it('starts empty, in the business country, and is a real (not sample) workspace', () => {
    expect(blank).toMatchObject({ mode: 'real', businessName: 'Priya Traders', settings: { currency: 'INR', timeZone: 'Asia/Kolkata' }, orders: [], stock: [] })
  })

  it('has nothing to rehearse, so it invents no problems and no options', () => {
    expect(rehearse(blank)).toMatchObject({ plans: [], conflicts: [], impact: { exposedQuantity: 0, affectedOrderIds: [] } })
  })

  it('is accepted by the same checks as any saved workspace', () => {
    expect(parseWorkspace(JSON.parse(JSON.stringify(blank)))).toEqual(blank)
  })
})

describe('saved data checks', () => {
  it('treats an older save with no mode as the sample', () => {
    const { mode, ...older } = sampleWorkspace
    expect(mode).toBe('demo')
    expect(parseWorkspace(older)?.mode).toBe('demo')
  })

  it('accepts values that came from an imported file', () => {
    const imported = { ...sampleWorkspace, stock: [{ locationId: 'north', productId: 'harbor-blend', available: { value: 5, evidence: { kind: 'import' as const, source: 'stock.xlsx', recordedAt: '2026-10-15T09:00:00+05:30' } } }] }
    expect(parseWorkspace(imported)).not.toBeNull()
  })

  it('allows a big distributor, but still refuses unbounded input', () => {
    expect(LIMITS.stock).toBeGreaterThanOrEqual(100 * 1000)
    const tooMany = { ...sampleWorkspace, stock: Array.from({ length: LIMITS.stock + 1 }, () => sampleWorkspace.stock[0]) }
    expect(parseWorkspace(tooMany)).toBeNull()
  })
})

describe('the data a plan check needs', () => {
  const order = (id: string, locationId: string, productId: string, dueAt: string, quantity: number): Order => ({
    id, customer: id, locationId, dueAt, priority: 'standard', lines: [{ productId, quantity }], evidence: sampleEvidence,
  })
  const bigger: Workspace = {
    ...sampleWorkspace,
    products: [...sampleWorkspace.products, { id: 'oat', name: 'Oat Milk', unit: 'case', pack: '12 x 1 L' }],
    locations: [...sampleWorkspace.locations, { id: 'east', name: 'East Store', kind: 'store', receivingLimitPerDay: 4 }],
    stock: [...sampleWorkspace.stock, { locationId: 'east', productId: 'harbor-blend', available: { value: 2, evidence: sampleEvidence } }],
    orders: [
      ...sampleWorkspace.orders,
      order('E1', 'east', 'harbor-blend', '2026-10-15T10:00:00+05:30', 9),
      order('N-OAT', 'north', 'oat', '2026-10-15T10:00:00+05:30', 30),
    ],
    shipments: [...sampleWorkspace.shipments, { ...sampleWorkspace.shipments[0], id: 'SH-EAST', locationId: 'east', confirmedArrivalAt: '2026-10-16T09:00:00+05:30' }],
    disruptions: [...sampleWorkspace.disruptions, { id: 'INC-2', kind: 'shipment-delay', shipmentId: 'SH-EAST' }],
    routes: [...sampleWorkspace.routes, { id: 'north-to-east', fromLocationId: 'north', toLocationId: 'east', arrivalAt: { value: '2026-10-15T08:00:00+05:30', evidence: sampleEvidence }, quotes: [] }],
  }

  it('gives the same answer for every plan as the whole workspace does', () => {
    const { plans } = rehearse(bigger)
    expect(plans.length).toBeGreaterThan(2)
    for (const plan of plans) {
      const slice = sliceForPlan(bigger, plan.id)
      expect(slice).not.toBeNull()
      expect(rehearse(slice as Workspace).plans.find((item) => item.id === plan.id)).toEqual(plan)
    }
  })

  it('leaves out other locations and products, so a big business sends a small request', () => {
    const slice = sliceForPlan(bigger, 'transfer:south-to-north:harbor-blend') as Workspace
    expect(slice.orders.map((item) => item.id)).not.toContain('E1')
    expect(slice.orders.map((item) => item.id)).not.toContain('N-OAT')
    expect(slice.products.map((item) => item.id)).toEqual(['harbor-blend'])
  })

  it('has no slice for a plan that does not exist', () => {
    expect(sliceForPlan(bigger, 'transfer:nowhere:nothing')).toBeNull()
  })
})
