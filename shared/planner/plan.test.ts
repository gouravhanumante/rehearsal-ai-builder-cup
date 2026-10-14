import { describe, expect, it } from 'vitest'
import type { Evidence, Order, Supplier, Workspace } from './model.js'
import { orderCoverage, rankPlans, recommendPlan, rehearse, storageCap } from './plan.js'
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

describe('is every order covered by its warehouse, even with nothing late', () => {
  // South Hub has 14 cases; nothing is delayed.
  const order = (id: string, quantity: number, dueAt: string): Order => ({
    id, customer: id, locationId: 'south', dueAt, priority: 'standard', lines: [{ productId: 'harbor-blend', quantity }], evidence: typed,
  })
  const quiet = (orders: Order[], extra: Partial<Workspace> = {}): Workspace => ({ ...sampleWorkspace, disruptions: [], shipments: [], orders, ...extra })
  const coverageOf = (data: Workspace, id: string) => orderCoverage(data).find((item) => item.orderId === id)
  const inbound = (arrival: string) => [{ ...sampleWorkspace.shipments[0], locationId: 'south', confirmedArrivalAt: arrival, originalArrivalAt: arrival }]

  it('an order bigger than the stock at its warehouse is short, even when no shipment is late', () => {
    expect(coverageOf(quiet([order('BIG', 20, thursdayMorning)]), 'BIG')).toMatchObject({ ordered: 20, covered: 14, status: 'short' })
  })

  it('an empty warehouse with nothing arriving covers nothing', () => {
    const data = withStock(quiet([order('BROOM', 20, thursdayMorning)]), 'south', 0)
    expect(coverageOf(data, 'BROOM')).toMatchObject({ covered: 0, status: 'short', arriving: 0 })
  })

  it('stock arriving before the order is due counts; stock arriving after does not', () => {
    const early = quiet([order('BIG', 20, thursdayMorning)], { shipments: inbound('2026-10-15T08:00:00+05:30') })
    const late = quiet([order('BIG', 20, thursdayMorning)], { shipments: inbound('2026-10-15T18:00:00+05:30') })
    expect(coverageOf(early, 'BIG')).toMatchObject({ status: 'covered', arriving: 24 })
    expect(coverageOf(late, 'BIG')).toMatchObject({ status: 'short', arriving: 0 })
  })

  it('two orders share the same stock: the one due first is served first', () => {
    const data = quiet([order('TUE', 10, '2026-10-20T10:00:00+05:30'), order('MON', 10, '2026-10-19T10:00:00+05:30')])
    expect(coverageOf(data, 'MON')).toMatchObject({ covered: 10, status: 'covered' })
    expect(coverageOf(data, 'TUE')).toMatchObject({ covered: 4, status: 'short' })
  })

  it('a warehouse that was never counted is unknown, not short', () => {
    const data = quiet([order('BIG', 20, thursdayMorning)], { stock: sampleWorkspace.stock.filter((record) => record.locationId !== 'south') })
    expect(coverageOf(data, 'BIG')?.status).toBe('unknown')
  })

  describe('regular deliveries', () => {
    // South Hub is empty; 10 cases arrive Monday 19 Oct, and again every week if it repeats.
    const monday = '2026-10-19T09:00:00+05:30'
    const weekly = (extra: Partial<Workspace['shipments'][number]> = {}) => [{ ...sampleWorkspace.shipments[0], locationId: 'south', lines: [{ productId: 'harbor-blend', quantity: 10 }], originalArrivalAt: monday, confirmedArrivalAt: monday, repeatEveryDays: 7, ...extra }]
    const dueAfterThird = '2026-11-03T10:00:00+05:30'

    it('a weekly delivery keeps counting: three Mondays cover an order of 25 due after the third', () => {
      const data = withStock(quiet([order('BIG', 25, dueAfterThird)], { shipments: weekly() }), 'south', 0)
      expect(coverageOf(data, 'BIG')).toMatchObject({ covered: 25, status: 'covered', arriving: 30 })
    })

    it('the same delivery entered once (not repeating) covers only 10', () => {
      const data = withStock(quiet([order('BIG', 25, dueAfterThird)], { shipments: weekly({ repeatEveryDays: undefined }) }), 'south', 0)
      expect(coverageOf(data, 'BIG')).toMatchObject({ covered: 10, status: 'short' })
    })

    it('one late delivery moves only that delivery, not the rest of the schedule', () => {
      // This week's delivery slips to Wednesday; next Monday's still comes on Monday 26 Oct.
      const late = weekly({ confirmedArrivalAt: '2026-10-21T09:00:00+05:30' })
      const data = withStock(quiet([order('TUE', 20, '2026-10-27T10:00:00+05:30')], { shipments: late }), 'south', 0)
      expect(coverageOf(data, 'TUE')).toMatchObject({ covered: 20, status: 'covered' })
    })
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

  const delayIn = (data: Workspace) => rehearse(data).impact.groups.find((group) => group.kind === 'delay')

  it('a delay at North Hub does not touch orders at another location', () => {
    expect(delayIn(bigger)?.affectedOrderIds).not.toContain('ORD-E1')
  })

  it('a delayed coffee shipment does not touch orders for other products', () => {
    expect(delayIn(bigger)?.affectedOrderIds).not.toContain('ORD-N9')
    expect(delayIn(bigger)?.exposedQuantity).toBe(24)
  })

  it('an order with several products only counts the delayed product', () => {
    const mixed: Order = { ...sampleWorkspace.orders[1], lines: [{ productId: 'harbor-blend', quantity: 12 }, { productId: 'oat-milk', quantity: 99 }] }
    const data = { ...bigger, orders: bigger.orders.map((order) => order.id === mixed.id ? mixed : order) }
    expect(delayIn(data)?.exposedQuantity).toBe(24)
  })

  it('an empty store short with nothing late is its own problem, separate from the delay', () => {
    const shortage = rehearse(bigger).impact.groups.find((group) => group.kind === 'shortage')
    expect(shortage).toMatchObject({ locationId: 'east', productId: 'harbor-blend', affectedOrderIds: ['ORD-E1'], exposedQuantity: 40, delayedUntil: null })
  })
})

describe('warehouse transfer options', () => {
  it('an order short with nothing late still gets recovery options: move stock from the warehouse that has it', () => {
    // North Hub has no coffee and nothing coming; South Hub has 14; the transfer arrives before the order is due.
    const data: Workspace = withStock({
      ...sampleWorkspace,
      disruptions: [], shipments: [],
      orders: [{ id: 'SK-1', customer: 'Shiva Kirana', locationId: 'north', dueAt: '2026-10-16T22:00:00+05:30', priority: 'protected', lines: [{ productId: 'harbor-blend', quantity: 3 }], evidence: typed }],
    }, 'north', 0)
    const { impact, plans } = rehearse(data)
    expect(impact.groups).toEqual([expect.objectContaining({ kind: 'shortage', exposedQuantity: 3, affectedOrderIds: ['SK-1'] })])
    expect(plans.find((plan) => plan.id === transferPlan)).toMatchObject({ status: 'ready', quantity: 3, outcome: { exposedQuantity: 0, protectsPriority: true } })
    expect(recommendPlan(plans)?.id).toBe(transferPlan)
  })

  it('moves only what is short, and never stock South Hub needs for its own orders', () => {
    // North is short 3. South has 14 but owes 12 to its own customer on Saturday, so only 2 can go.
    const southOwn: Order = { id: 'S-1', customer: 'South buyer', locationId: 'south', dueAt: '2026-10-17T09:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity: 12 }], evidence: typed }
    const data: Workspace = withStock({
      ...sampleWorkspace,
      disruptions: [], shipments: [],
      orders: [{ id: 'SK-1', customer: 'Shiva Kirana', locationId: 'north', dueAt: '2026-10-16T22:00:00+05:30', priority: 'protected', lines: [{ productId: 'harbor-blend', quantity: 3 }], evidence: typed }, southOwn],
    }, 'north', 0)
    expect(planIn(data, transferPlan)).toMatchObject({ quantity: 2, outcome: { exposedQuantity: 1 } })
  })

  it('a covered order raises no problem at all', () => {
    const data: Workspace = { ...sampleWorkspace, disruptions: [], shipments: [], orders: [{ ...sampleWorkspace.orders[0], lines: [{ productId: 'harbor-blend', quantity: 5 }] }] }
    expect(rehearse(data)).toMatchObject({ plans: [], impact: { groups: [] } })
  })
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

  // The sample morning is Thu 15 Oct, 9:00; the priority order is due at 2:00 pm the same day.
  const withTravel = (hours: number | null, evidence: Evidence = sampleEvidence) =>
    ({ ...sampleWorkspace, routes: [{ ...sampleWorkspace.routes[0], travelHours: hours === null ? { value: null, evidence: null } : { value: hours, evidence } }] })

  it('rejects a capacity-valid transfer that arrives after the priority promise: 30 hours is too slow', () => {
    expect(planIn(withTravel(30), transferPlan)).toMatchObject({ status: 'rejected', reason: { code: 'transfer-late' } })
  })

  it('needs information when nobody knows how long the transfer takes', () => {
    expect(planIn(withTravel(null), transferPlan)).toMatchObject({ status: 'conditional', reason: { code: 'transfer-arrival-unknown' } })
  })

  it('counts the arrival from now, so a route saved last week is not stale: 3 hours from 9:00 is noon', () => {
    expect(planIn(withTravel(3), transferPlan)?.arrivalAt).toBe(new Date('2026-10-15T12:00:00+05:30').toISOString())
    const nextWeek = rehearse(withTravel(3), '2026-10-22T09:00:00+05:30').plans.find((plan) => plan.id === transferPlan)
    expect(nextWeek?.arrivalAt).toBe(new Date('2026-10-22T12:00:00+05:30').toISOString())
  })

  it('still reads a fixed arrival time from older saves that have no travel time', () => {
    const { travelHours: _drop, ...old } = sampleWorkspace.routes[0]
    const data = { ...sampleWorkspace, routes: [{ ...old, arrivalAt: { value: '2026-10-16T15:00:00+05:30', evidence: sampleEvidence } }] }
    expect(planIn(data, transferPlan)).toMatchObject({ status: 'rejected', reason: { code: 'transfer-late' } })
  })

  it('does not reuse an 8-case quote when a different quantity is moved: 5 cases use the trip rate, ₹55 + 5 × ₹5', () => {
    const quoted = { ...sampleWorkspace, routes: [{ ...sampleWorkspace.routes[0], quotes: [{ quantity: 8, amount: 70 }] }] }
    expect(planIn(withStock(quoted, 'south', 5), transferPlan)).toMatchObject({ quantity: 5, cost: { amount: 80 } })
  })

  it('flags the transfer as unverified when a stock count it relies on was typed in', () => {
    expect(planIn(withStock(sampleWorkspace, 'south', 14), transferPlan)?.unverified).toEqual([
      { type: 'stock', locationId: 'south', productId: 'harbor-blend', quantity: 14 },
    ])
  })
  it('flags the transfer as unverified when its travel time was typed in', () => {
    expect(planIn(withTravel(2, typed), transferPlan)?.unverified).toEqual([{ type: 'route', routeId: 'south-to-north', arrivalAt: new Date('2026-10-15T11:00:00+05:30').toISOString() }])
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

  it('when two suppliers both cover the shortage in time, recommends the cheaper one', () => {
    const offerAt = (price: number) => [{ productId: 'harbor-blend', locationId: 'north', available: { value: 30, evidence: quote }, pricePerUnit: { value: price, evidence: quote }, arrivalAt: { value: thursdayMorning, evidence: quote } }]
    const data: Workspace = { ...sampleWorkspace, suppliers: [
      { id: 'pricey', name: 'Pricey Co', offers: offerAt(20) },
      { id: 'cheap', name: 'Cheap Co', offers: offerAt(12) },
    ] }
    expect(recommendPlan(rehearse(data).plans)?.supplierId).toBe('cheap')
  })

  it('lists options best first: the recommended one, then other ready ones, then waiting for a reply, then can\'t be done', () => {
    const { plans } = rehearse(sampleWorkspace)
    const ranked = rankPlans(plans)
    expect(ranked[0].id).toBe(recommendPlan(plans)?.id)
    const statuses = ranked.map((plan) => plan.status)
    expect(statuses).toEqual([...statuses].sort((first, second) => ['ready', 'conditional', 'rejected'].indexOf(first) - ['ready', 'conditional', 'rejected'].indexOf(second)))
    expect(new Set(statuses)).toEqual(new Set(['ready', 'conditional', 'rejected']))
  })
})

describe('storage limits', () => {
  // North Hub has 14 cases and is 24 short before the delayed shipment lands.
  const withLimit = (atNorth?: number): Workspace => ({
    ...sampleWorkspace,
    storageLimits: atNorth === undefined ? [] : [{ locationId: 'north', productId: 'harbor-blend', limit: atNorth }],
  })

  it('asks a backup supplier only for what still fits: holds 20, has 14, so ask for 6 even though 24 are short', () => {
    expect(planIn(withLimit(20), supplierPlan)?.request).toEqual({ quantity: 6, neededBy: '2026-10-15T14:00:00+05:30' })
  })

  it('asks for the whole shortage when no storage limit is set', () => {
    expect(planIn(sampleWorkspace, supplierPlan)?.request?.quantity).toBe(24)
  })

  it('keeps a warehouse limit specific to the selected product and location', () => {
    const data = withLimit(20)
    expect(storageCap(data, 'north', 'harbor-blend')).toBe(20)
    expect(storageCap(data, 'south', 'harbor-blend')).toBeNull()
  })

  it('asks for only the room left at the selected warehouse', () => {
    expect(planIn(withLimit(18), supplierPlan)?.spaceLeft).toBe(4)
  })

  it('moves only what fits in storage, even when the receiving limit would allow more', () => {
    expect(planIn(withLimit(18), transferPlan)).toMatchObject({ status: 'ready', quantity: 4 })
  })

  it("rejects transfers and suppliers when the warehouse is already full, but shipping an order from elsewhere still works", () => {
    const full = { ...withLimit(14), deliveryAnswers: [{ fromLocationId: 'south', forLocationId: 'north', canDeliver: true }] }
    expect(planIn(full, transferPlan)).toMatchObject({ status: 'rejected', reason: { code: 'no-space', limit: 14 } })
    expect(planIn(full, supplierPlan)).toMatchObject({ status: 'rejected', reason: { code: 'no-space', limit: 14 } })
    expect(recommendPlan(rehearse(full).plans)?.kind).toBe('ship-from')
  })
})

describe('what each option costs, including getting it there', () => {
  // North Hub has no coffee; Shiva Kirana wants 3 cases on Friday. South Hub has 14.
  const shiva: Order = { id: 'SK-1', customer: 'Shiva Kirana', locationId: 'north', dueAt: '2026-10-16T22:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity: 3 }], evidence: typed }
  const quiet = (extra: Partial<Workspace> = {}): Workspace => withStock({ ...sampleWorkspace, disruptions: [], shipments: [], orders: [shiva], suppliers: [], ...extra }, 'north', 0)
  const route = (costs: { costPerTrip?: number | null; costPerUnit?: number | null }) => [{ ...sampleWorkspace.routes[0], quotes: [], ...costs }]
  const offer = (price: number, delivery: number | null) => ({
    productId: 'harbor-blend', locationId: 'north', available: { value: 20, evidence: quote }, pricePerUnit: { value: price, evidence: quote },
    arrivalAt: { value: '2026-10-16T09:00:00+05:30', evidence: quote }, deliveryCharge: delivery === null ? { value: null, evidence: null } : { value: delivery, evidence: quote },
  })

  it('a transfer costs the trip plus a price per case: ₹500 + 3 × ₹10 = ₹530', () => {
    expect(planIn(quiet({ routes: route({ costPerTrip: 500, costPerUnit: 10 }) }), transferPlan)?.cost?.amount).toBe(530)
  })

  it('a price quoted for the exact quantity still wins over the trip rate', () => {
    const quoted = { ...sampleWorkspace, routes: [{ ...sampleWorkspace.routes[0], quotes: [{ quantity: 8, amount: 70 }] }] }
    expect(planIn(quoted, transferPlan)?.cost?.amount).toBe(70)
  })

  it('a supplier costs their price for each case plus their delivery charge: 3 × ₹40 + ₹200 = ₹320', () => {
    const data = quiet({ routes: [], suppliers: [{ id: 'b', name: 'B', offers: [offer(40, 200)] }] })
    expect(planIn(data, 'supplier:b:harbor-blend:north')).toMatchObject({ cost: { amount: 320 } })
    const noCharge = quiet({ routes: [], suppliers: [{ id: 'b', name: 'B', offers: [offer(40, null)] }] })
    expect(planIn(noCharge, 'supplier:b:harbor-blend:north')).toMatchObject({ cost: { amount: 120 }, costExcludesDelivery: true })
  })

  it('the cheaper supplier is the one with the lower total, not the lower price per case', () => {
    const data = quiet({ routes: [], suppliers: [
      { id: 'cheap-case', name: 'Cheap per case', offers: [offer(30, 300)] },
      { id: 'no-delivery', name: 'Free delivery', offers: [offer(40, 0)] },
    ] })
    expect(recommendPlan(rehearse(data).plans)?.supplierId).toBe('no-delivery')
  })

  it('shipping from South Hub costs the difference in delivery: ₹250 there vs ₹100 from North is ₹150 more', () => {
    const locations = (north: number | null, south: number | null) => sampleWorkspace.locations.map((location) => ({ ...location, deliveryCostPerOrder: location.id === 'north' ? north : south }))
    expect(planIn(quiet({ routes: [], locations: locations(100, 250) }), 'ship:SK-1:south:harbor-blend')?.cost?.amount).toBe(150)
    expect(planIn(quiet({ routes: [], locations: locations(null, 250) }), 'ship:SK-1:south:harbor-blend')?.cost).toBeNull()
  })
})

describe('ship a short order from another warehouse instead', () => {
  // North Hub has no coffee; Shiva Kirana wants 3 cases from North on Friday. South Hub has 14.
  const friday = '2026-10-16T22:00:00+05:30'
  const shiva: Order = { id: 'SK-1', customer: 'Shiva Kirana', locationId: 'north', dueAt: friday, priority: 'protected', lines: [{ productId: 'harbor-blend', quantity: 3 }], evidence: typed }
  const southOrder = (quantity: number): Order => ({ id: 'S-1', customer: 'South buyer', locationId: 'south', dueAt: '2026-10-17T09:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity }], evidence: typed })
  const southDelivers = [{ fromLocationId: 'south', forLocationId: 'north', canDeliver: true }]
  const data = (orders: Order[], extra: Partial<Workspace> = {}): Workspace => withStock({ ...sampleWorkspace, disruptions: [], shipments: [], routes: [], orders, deliveryAnswers: southDelivers, ...extra }, 'north', 0)
  const shipPlan = 'ship:SK-1:south:harbor-blend'

  it('until you say South Hub can deliver to North Hub\'s customers, it is a question, never the best option', () => {
    const unanswered = data([shiva], { deliveryAnswers: [] })
    expect(planIn(unanswered, shipPlan)).toMatchObject({ status: 'conditional', reason: { code: 'ship-from-ask' }, outcome: null })
    expect(recommendPlan(rehearse(unanswered).plans)).toBeUndefined()
  })

  it('after you say No (e.g. a Delhi warehouse for Bangalore customers), it is never suggested', () => {
    expect(planIn(data([shiva], { deliveryAnswers: [{ fromLocationId: 'south', forLocationId: 'north', canDeliver: false }] }), shipPlan)).toBeUndefined()
  })

  it('South Hub can send the order itself, even with no transfer route', () => {
    const { plans } = rehearse(data([shiva]))
    expect(plans.find((plan) => plan.id === shipPlan)).toMatchObject({ status: 'ready', orderId: 'SK-1', sourceLocationId: 'south', outcome: { exposedQuantity: 0, protectsPriority: true } })
    expect(recommendPlan(plans)?.id).toBe(shipPlan)
  })

  it("not when it would leave South Hub short for its own later order: 14 there, 12 promised for Saturday, 3 asked", () => {
    expect(planIn(data([shiva, southOrder(12)]), shipPlan)).toMatchObject({ status: 'rejected', reason: { code: 'ship-from-short' }, outcome: null })
  })

  it('the whole order moves, so South Hub must also have the other products in it', () => {
    const mixed = { ...shiva, lines: [...shiva.lines, { productId: 'oat-milk', quantity: 2 }] }
    const products = [...sampleWorkspace.products, { id: 'oat-milk', name: 'Oat Milk', unit: 'case', pack: '12 x 1 L' }]
    expect(planIn(data([mixed], { products }), shipPlan)?.status).toBe('rejected')
  })
})
