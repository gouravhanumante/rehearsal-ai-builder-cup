import { describe, expect, it } from 'vitest'
import type { Evidence, Order, Supplier, Workspace } from './model.js'
import { recommendPlan, rehearse } from './plan.js'
import { sampleEvidence, sampleWorkspace } from './sample.js'

const typed: Evidence = { kind: 'manual', source: 'Entered manually', recordedAt: '2026-10-15T09:00:00+05:30' }
const quote: Evidence = { kind: 'document', source: 'supplier-b-quote.pdf', recordedAt: '2026-10-15T09:00:00+05:30' }
const thursdayMorning = '2026-10-15T10:00:00+05:30'

const withStock = (data: Workspace, locationId: string, value: number, evidence: Evidence = typed): Workspace => ({
  ...data,
  stock: data.stock.map((record) => record.locationId === locationId ? { ...record, available: { value, evidence } } : record),
})

function withSupplierB(details: { cases: number | null; price: number | null; arrival: string | null; evidence: Evidence }): Workspace {
  const fact = <T,>(value: T | null) => ({ value, evidence: value === null ? null : details.evidence })
  const supplier: Supplier = {
    id: 'supplier-b', name: 'Supplier B',
    offers: [{ productId: 'harbor-blend', locationId: 'north', available: fact(details.cases), pricePerUnit: fact(details.price), arrivalAt: fact(details.arrival) }],
  }
  return { ...sampleWorkspace, suppliers: [supplier] }
}

const planIn = (data: Workspace, id: string) => rehearse(data).plans.find((plan) => plan.id === id)
const supplierPlan = 'supplier:supplier-b:harbor-blend:north'
const transferPlan = 'transfer:south-to-north:harbor-blend'

describe('which orders the delay affects', () => {
  it('counts only orders due before the delayed shipment arrives', () => {
    const { impact } = rehearse(sampleWorkspace)
    expect(impact.affectedOrderIds).toEqual(['ORD-1082', 'ORD-1086', 'ORD-1091'])
    expect(impact.exposedQuantity).toBe(24)
    expect(impact.groups[0].allocations.map((item) => item.covered)).toEqual([14, 0, 0])
  })

  it('lists an order due after the shipment arrives as unaffected, not at risk', () => {
    expect(rehearse(sampleWorkspace).impact.unaffectedOrderIds).toEqual(['ORD-1104'])
  })

  it('treats a location with no recorded stock as unknown exposure, never as zero stock', () => {
    const data = { ...sampleWorkspace, stock: sampleWorkspace.stock.filter((record) => record.locationId !== 'north') }
    const { impact, plans } = rehearse(data)
    expect(impact.groups[0].exposedQuantity).toBeNull()
    expect(impact.unknownGroups).toBe(1)
    expect(plans).toEqual([])
  })
})

describe('more locations and products', () => {
  const secondProduct = { id: 'oat-milk', name: 'Oat Milk', unit: 'case', pack: '12 x 1 L' }
  const bigger: Workspace = {
    ...sampleWorkspace,
    products: [...sampleWorkspace.products, secondProduct],
    locations: [...sampleWorkspace.locations, { id: 'east', name: 'East Store', kind: 'store', receivingLimitPerDay: null }],
    stock: [...sampleWorkspace.stock, { locationId: 'east', productId: 'harbor-blend', available: { value: 0, evidence: sampleEvidence } }],
    orders: [
      ...sampleWorkspace.orders,
      { id: 'ORD-E1', customer: 'East walk-ins', locationId: 'east', dueAt: '2026-10-15T11:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity: 40 }], evidence: sampleEvidence },
      { id: 'ORD-N9', customer: 'Oat buyer', locationId: 'north', dueAt: '2026-10-15T11:00:00+05:30', priority: 'standard', lines: [{ productId: 'oat-milk', quantity: 50 }], evidence: sampleEvidence },
    ],
  }

  it('a delay at North Hub does not touch orders at another location', () => {
    expect(rehearse(bigger).impact.unaffectedOrderIds).toContain('ORD-E1')
  })

  it('a delayed coffee shipment does not touch orders for other products', () => {
    const { impact } = rehearse(bigger)
    expect(impact.unaffectedOrderIds).toContain('ORD-N9')
    expect(impact.exposedQuantity).toBe(24)
  })

  it('an order with several products only counts the delayed product', () => {
    const mixed: Order = { ...sampleWorkspace.orders[1], lines: [{ productId: 'harbor-blend', quantity: 12 }, { productId: 'oat-milk', quantity: 99 }] }
    const data = { ...bigger, orders: bigger.orders.map((order) => order.id === mixed.id ? mixed : order) }
    expect(rehearse(data).impact.exposedQuantity).toBe(24)
  })
})

describe('warehouse transfer options', () => {
  it('allows a transfer within receiving capacity and calculates remaining exposure', () => {
    expect(planIn(sampleWorkspace, transferPlan)).toMatchObject({
      status: 'ready', quantity: 8, cost: { amount: 95, currency: 'INR' },
      outcome: { exposedQuantity: 16, protectsPriority: true }, unverified: [],
    })
  })

  it('rejects moving everything when it exceeds the daily receiving limit', () => {
    expect(planIn(sampleWorkspace, 'bulk:south-to-north:harbor-blend')).toMatchObject({
      status: 'rejected', reason: { code: 'transfer-over-limit', limit: 8, excess: 6 },
    })
  })

  it('does not offer moving "everything" separately when everything already fits', () => {
    expect(planIn(withStock(sampleWorkspace, 'south', 6), 'bulk:south-to-north:harbor-blend')).toBeUndefined()
  })

  it('rejects a capacity-valid transfer that arrives after the priority promise', () => {
    const data = { ...sampleWorkspace, routes: [{ ...sampleWorkspace.routes[0], arrivalAt: { value: '2026-10-16T15:00:00+05:30', evidence: sampleEvidence } }] }
    expect(planIn(data, transferPlan)).toMatchObject({ status: 'rejected', reason: { code: 'transfer-late' } })
  })

  it('needs information when the transfer arrival time is unknown', () => {
    const data = { ...sampleWorkspace, routes: [{ ...sampleWorkspace.routes[0], arrivalAt: { value: null, evidence: null } }] }
    expect(planIn(data, transferPlan)).toMatchObject({ status: 'conditional', reason: { code: 'transfer-arrival-unknown' } })
  })

  it('does not reuse the 8-case price when a different quantity is moved', () => {
    expect(planIn(withStock(sampleWorkspace, 'south', 5), transferPlan)).toMatchObject({ quantity: 5, cost: null })
  })

  it('flags the transfer as unverified when a stock count it relies on was typed in', () => {
    expect(planIn(withStock(sampleWorkspace, 'south', 14), transferPlan)?.unverified).toEqual([
      { type: 'stock', locationId: 'south', productId: 'harbor-blend', quantity: 14 },
    ])
  })
  it('flags the transfer as unverified when its arrival time was typed in', () => {
    const data = { ...sampleWorkspace, routes: [{ ...sampleWorkspace.routes[0], arrivalAt: { value: '2026-10-15T11:00:00+05:30', evidence: typed } }] }
    expect(planIn(data, transferPlan)?.unverified).toEqual([{ type: 'route', routeId: 'south-to-north', arrivalAt: '2026-10-15T11:00:00+05:30' }])
  })
})

describe('backup supplier options', () => {
  it('stays "needs information" while any of stock, price, or arrival is unknown, and says which', () => {
    expect(planIn(withSupplierB({ cases: 20, price: 11, arrival: null, evidence: quote }), supplierPlan)).toMatchObject({
      status: 'conditional', reason: { code: 'supplier-missing', missing: ['arrivalAt'] },
    })
  })

  it('is usable with typed-in details, but marked unverified so approval warns first', () => {
    const plan = planIn(withSupplierB({ cases: 20, price: 11, arrival: thursdayMorning, evidence: typed }), supplierPlan)
    expect(plan?.status).toBe('ready')
    expect(plan?.unverified).toHaveLength(3)
  })

  it('is ready with no warning when the same details come from a document', () => {
    expect(planIn(withSupplierB({ cases: 20, price: 11, arrival: thursdayMorning, evidence: quote }), supplierPlan)).toMatchObject({ status: 'ready', unverified: [] })
  })

  it('buys only what is short and prices it per unit, in the workspace currency', () => {
    expect(planIn(withSupplierB({ cases: 40, price: 11, arrival: thursdayMorning, evidence: quote }), supplierPlan)).toMatchObject({
      quantity: 24, cost: { amount: 264, currency: 'INR' }, outcome: { exposedQuantity: 0, protectsPriority: true },
    })
  })

  it('does not protect the priority order with stock that lands after that order is due', () => {
    expect(planIn(withSupplierB({ cases: 20, price: 11, arrival: '2026-10-16T10:00:00+05:30', evidence: quote }), supplierPlan)).toMatchObject({
      status: 'ready', outcome: { exposedQuantity: 4, protectsPriority: false },
    })
  })

  it("can't be done when the stock arrives after every affected order is due", () => {
    expect(planIn(withSupplierB({ cases: 20, price: 11, arrival: '2026-10-16T13:00:00+05:30', evidence: quote }), supplierPlan)).toMatchObject({
      status: 'rejected', reason: { code: 'supplier-too-late' },
    })
  })
})

describe('priority order vs an earlier order (conflicts)', () => {
  // Harbor Market (standard) is due before Common Ground (priority); both need the same stock.
  const contested: Workspace = withStock({
    ...sampleWorkspace,
    orders: [
      { ...sampleWorkspace.orders[1], dueAt: '2026-10-15T10:00:00+05:30', lines: [{ productId: 'harbor-blend', quantity: 14 }] },
      { ...sampleWorkspace.orders[0], lines: [{ productId: 'harbor-blend', quantity: 14 }] },
    ],
  }, 'north', 14, sampleEvidence)
  const conflictId = 'conflict:ORD-1082:harbor-blend'
  const covered = (data: Workspace, orderId: string) => rehearse(data).impact.groups[0].allocations.find((item) => item.orderId === orderId)?.covered

  it('by default the earliest-due order gets the stock, and the conflict is raised for the user', () => {
    const { conflicts } = rehearse(contested)
    expect(covered(contested, 'ORD-1086')).toBe(14)
    expect(covered(contested, 'ORD-1082')).toBe(0)
    expect(conflicts).toEqual([expect.objectContaining({ id: conflictId, priorityOrderId: 'ORD-1082', earlierOrderIds: ['ORD-1086'], quantity: 14, winner: 'earliest-due', decided: false })])
  })

  it('when the user picks the priority order, it gets the stock instead', () => {
    const decided = { ...contested, conflictDecisions: [{ conflictId, winner: 'priority' as const }] }
    expect(covered(decided, 'ORD-1082')).toBe(14)
    expect(covered(decided, 'ORD-1086')).toBe(0)
    expect(rehearse(decided).conflicts[0]).toMatchObject({ winner: 'priority', decided: true })
  })

  it('raises no conflict when the priority order is due first anyway', () => {
    expect(rehearse(sampleWorkspace).conflicts).toEqual([])
  })
})

describe('overview recommendation', () => {
  it('prefers the plan that protects the priority order with the least left exposed', () => {
    expect(recommendPlan(rehearse(withSupplierB({ cases: 20, price: 11, arrival: thursdayMorning, evidence: quote })).plans)?.id).toBe(supplierPlan)
    expect(recommendPlan(rehearse(sampleWorkspace).plans)?.id).toBe(transferPlan)
  })

  it('recommends nothing when no option is ready', () => {
    expect(recommendPlan(rehearse(withStock(sampleWorkspace, 'south', 0)).plans)).toBeUndefined()
  })
})
