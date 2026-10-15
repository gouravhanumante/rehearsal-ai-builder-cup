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
  it('accepts values that came from an imported file', () => {
    const count = { id: 'CNT-1', kind: 'count' as const, locationId: 'north', productId: 'harbor-blend', quantity: 5, at: '2026-10-15T09:00:00+05:30', evidence: { kind: 'import' as const, source: 'stock.xlsx', recordedAt: '2026-10-15T09:00:00+05:30' } }
    expect(parseWorkspace({ ...sampleWorkspace, movements: [count] })?.stock[0].available.evidence.kind).toBe('import')
  })

  it('allows a big distributor, but still refuses unbounded input', () => {
    expect(LIMITS.movements).toBeGreaterThanOrEqual(100 * 1000)
    const tooMany = { ...sampleWorkspace, movements: Array.from({ length: LIMITS.movements + 1 }, (_, index) => ({ ...sampleWorkspace.movements[0], id: `CNT-${index}` })) }
    expect(parseWorkspace(tooMany)).toBeNull()
  })

  it('refuses a saved file with a storage limit that is not a whole number of units', () => {
    expect(parseWorkspace({ ...sampleWorkspace, storageLimits: [{ locationId: 'north', productId: 'harbor-blend', limit: -5 }] })).toBeNull()
  })

  it('keeps a saved "stock can\'t move from South Hub to North Hub" answer', () => {
    expect(parseWorkspace({ ...sampleWorkspace, noTransfers: [{ fromLocationId: 'south', toLocationId: 'north' }] })).not.toBeNull()
  })

  it('accepts recorded arrivals but refuses invalid times, quantities and kinds', () => {
    const receipt = { id: 'RCV-1:harbor-blend', kind: 'receipt' as const, locationId: 'north', productId: 'harbor-blend', quantity: 6, at: '2026-10-15T09:30:00+05:30', evidence: sampleEvidence, shipmentId: 'TR-1', fromLocationId: 'south' }
    expect(parseWorkspace({ ...sampleWorkspace, movements: [...sampleWorkspace.movements, receipt] })?.stock.find((item) => item.locationId === 'north')?.available.value).toBe(20)
    for (const invalid of [{ ...receipt, at: 'invalid' }, { ...receipt, quantity: -6 }, { ...receipt, kind: 'gift' }]) {
      expect(parseWorkspace({ ...sampleWorkspace, movements: [...sampleWorkspace.movements, invalid] })).toBeNull()
    }
  })
})

describe('the data a plan check needs', () => {
  const order = (id: string, locationId: string, productId: string, dueAt: string, quantity: number): Order => ({
    id, customer: id, locationId, dueAt, priority: 'standard', lines: [{ productId, quantity }], evidence: sampleEvidence,
  })
  const bigger: Workspace = {
    ...sampleWorkspace,
    products: [sampleWorkspace.products[0], { id: 'oat', name: 'Oat Milk', unit: 'case', pack: '12 x 1 L' }],
    locations: [...sampleWorkspace.locations, { id: 'east', name: 'East Store', kind: 'store', receivingLimitPerDay: 4 }],
    stock: [...sampleWorkspace.stock, { locationId: 'east', productId: 'harbor-blend', available: { value: 2, evidence: sampleEvidence } }],
    storageLimits: [{ locationId: 'east', productId: 'harbor-blend', limit: 5 }],
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

  it('the server still counts a different product already booked against the same receiving day', () => {
    const data: Workspace = { ...bigger, shipments: [...bigger.shipments, {
      ...sampleWorkspace.shipments[0], id: 'TR-oat', supplierName: 'Transfer from East Store', fromLocationId: 'east',
      lines: [{ productId: 'oat', quantity: 3 }],
      originalArrivalAt: '2026-10-15T10:00:00+05:30', confirmedArrivalAt: '2026-10-15T10:00:00+05:30',
    }] }
    const planId = 'transfer:south-to-north:harbor-blend'
    expect(rehearse(data).plans.find((plan) => plan.id === planId)?.quantity).toBe(5)
    const slice = sliceForPlan(data, planId) as Workspace
    expect(rehearse(slice).plans.find((plan) => plan.id === planId)?.quantity).toBe(5)
  })

  it('the server keeps other-product arrivals at the destination without sending unrelated receipt history', () => {
    const receipt = { id: 'RCV-oat', kind: 'receipt' as const, locationId: 'north', productId: 'oat', quantity: 3, at: '2026-10-15T09:00:00+05:30', evidence: sampleEvidence, shipmentId: 'TR-oat', fromLocationId: 'east' }
    const data: Workspace = { ...bigger, movements: [...bigger.movements, receipt, { ...receipt, id: 'RCV-east', locationId: 'east' }] }
    const planId = 'transfer:south-to-north:harbor-blend'
    const slice = sliceForPlan(data, planId) as Workspace
    expect(slice.movements).toContainEqual(receipt)
    expect(slice.movements.map((item) => item.id)).not.toContain('RCV-east')
    expect(parseWorkspace(slice)).not.toBeNull()
    expect(rehearse(slice).plans.find((plan) => plan.id === planId)).toEqual(rehearse(data).plans.find((plan) => plan.id === planId))
    expect(rehearse(slice).plans.find((plan) => plan.id === planId)?.quantity).toBe(5)
  })
})
