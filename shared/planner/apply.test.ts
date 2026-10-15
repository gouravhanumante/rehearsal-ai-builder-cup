import { describe, expect, it } from 'vitest'
import type { Workspace } from './model.js'
import { addHistory, applyPlan, overdueSince, receiveDelivery } from './apply.js'
import { cancelRemaining, cancelTransferBooking, departTransfer, freeStock, reservedStock, resolveTransferFate, sendOrder, stockFrom, transferRemainingLines } from './ledger.js'
import { orderCoverage, rehearse } from './plan.js'
import { SAMPLE_NOW, sampleEvidence, sampleWorkspace } from './sample.js'
import { LIMITS } from './validate.js'

const planOf = (data: Workspace, id: string) => {
  const plan = rehearse(data).plans.find((item) => item.id === id)
  if (!plan) throw new Error(`no plan ${id}`)
  return plan
}
const exposure = (data: Workspace) => rehearse(data).impact.exposedQuantity

describe('approving a plan changes the records, so the picture stays true', () => {
  // North Hub is 24 cases short before the late delivery; South Hub has 14 and can send 8 a day.
  it('booking a transfer leaves physical stock, reserves it from another booking', () => {
    const next = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    expect(next.stock.find((record) => record.locationId === 'south')?.available.value).toBe(14)
    expect(reservedStock(next, 'south', 'harbor-blend')).toBe(8)
    expect(freeStock(next, 'south', 'harbor-blend')).toBe(6)
    expect(next.shipments.at(-1)).toMatchObject({ locationId: 'north', lines: [{ productId: 'harbor-blend', quantity: 8 }], supplierName: 'Transfer from South Hub', fromLocationId: 'south', transferStatus: 'booked' })
    expect(exposure(next)).toBe(24)
    expect(planOf({ ...next, locations: next.locations.map((location) => location.id === 'north' ? { ...location, receivingLimitPerDay: null } : location) }, 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'ready', quantity: 6 })
    const shipment = next.shipments.at(-1)!
    const departed = departTransfer(next, shipment.id, shipment.lines, SAMPLE_NOW)
    expect('error' in departed).toBe(false)
    if ('error' in departed) return
    expect(departed.workspace.stock.find((record) => record.locationId === 'south')?.available.value).toBe(6)
    expect(reservedStock(departed.workspace, 'south', 'harbor-blend')).toBe(0)
    expect(freeStock(departed.workspace, 'south', 'harbor-blend')).toBe(6)
  })

  it('cancelling a booking frees only its unshipped stock; a partial departure stays on the road', () => {
    const booked = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    const shipment = booked.shipments.at(-1)!
    expect(receiveDelivery(booked, shipment.id, shipment.lines, null, SAMPLE_NOW)).toBe(booked)
    const partial = departTransfer(booked, shipment.id, [{ productId: 'harbor-blend', quantity: 3 }], SAMPLE_NOW)
    expect('error' in partial).toBe(false)
    if ('error' in partial) return
    expect(partial.workspace.stock.find((record) => record.locationId === 'south')?.available.value).toBe(11)
    expect(reservedStock(partial.workspace, 'south', 'harbor-blend')).toBe(5)
    const cancelled = cancelTransferBooking(partial.workspace, shipment.id)
    expect('error' in cancelled).toBe(false)
    if ('error' in cancelled) return
    expect(cancelled.workspace.stock.find((record) => record.locationId === 'south')?.available.value).toBe(11)
    expect(reservedStock(cancelled.workspace, 'south', 'harbor-blend')).toBe(0)
    expect(cancelled.workspace.shipments.find((item) => item.id === shipment.id)).toMatchObject({ transferStatus: 'cancelled', lines: [] })
    expect(transferRemainingLines(cancelled.workspace, shipment.id)).toEqual([])
    const batch = cancelled.workspace.shipments.find((item) => item.transferBookingId === shipment.id)!
    const received = receiveDelivery(cancelled.workspace, batch.id, [{ productId: 'harbor-blend', quantity: 3 }], null, SAMPLE_NOW)
    expect(received.stock.find((record) => record.locationId === 'north')?.available.value).toBe(17)
    expect(received.stock.find((record) => record.locationId === 'south')?.available.value).toBe(11)
  })

  it('after approving 8 into North Hub today, no second transfer is offered today: its 8-a-day receiving limit is used up (user decision 2026-10-16)', () => {
    const next = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    expect(planOf(next, 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'rejected', quantity: 0, reason: { code: 'receiving-full', limit: 8, booked: 8 } })
  })

  it('a transfer approved for another day does not use up today\'s receiving limit', () => {
    const next = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    const otherDay: Workspace = { ...next, shipments: next.shipments.map((item) => item.supplierName === 'Transfer from South Hub' ? { ...item, originalArrivalAt: '2026-10-14T12:00:00+05:30', confirmedArrivalAt: '2026-10-14T12:00:00+05:30' } : item) }
    // The booked 8 still count against the source; the remaining 6 fit another day.
    expect(planOf(otherDay, 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'ready', quantity: 6 })
  })

  it('only the unbooked receiving capacity is offered, using the business day rather than UTC', () => {
    const booked: Workspace = { ...sampleWorkspace, shipments: [...sampleWorkspace.shipments, {
      ...sampleWorkspace.shipments[0], id: 'TR-booked', supplierName: 'Transfer from East', fromLocationId: 'east',
      lines: [{ productId: 'other-product', quantity: 3 }],
      originalArrivalAt: '2026-10-14T20:00:00Z', confirmedArrivalAt: '2026-10-14T20:00:00Z',
    }] }
    expect(planOf(booked, 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'ready', quantity: 5, reason: { booked: 3 } })
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

describe('sending and cancelling an order', () => {
  const sendAll = (data: Workspace, orderId: string) => sendOrder(data, orderId, data.orders.find((item) => item.id === orderId)!.lines, SAMPLE_NOW)

  it('cannot send 18 with only 14 counted, and stock stays 14', () => {
    expect(sendAll(sampleWorkspace, 'ORD-1082')).toHaveProperty('error')
    expect(sampleWorkspace.stock.find((record) => record.locationId === 'north')?.available.value).toBe(14)
  })

  it('a missing count blocks sending and repeated product lines must fit together', () => {
    const missing = { ...sampleWorkspace, movements: [], stock: [] }
    expect(sendAll(missing, 'ORD-1104')).toHaveProperty('error')
    const repeated: Workspace = { ...sampleWorkspace, orders: [{ ...sampleWorkspace.orders[0], lines: [{ productId: 'harbor-blend', quantity: 10 }, { productId: 'harbor-blend', quantity: 8 }] }] }
    expect(sendAll(repeated, 'ORD-1082')).toHaveProperty('error')
  })

  // North Hub has 14 cases; Common Ground Cafe's 18-case order is the first one due.
  it('a cancelled order stops counting: the others get its stock, and North Hub keeps all 14', () => {
    const result = cancelRemaining(sampleWorkspace, 'ORD-1082', SAMPLE_NOW)
    if ('error' in result) throw new Error(result.error)
    expect(rehearse(result.workspace).impact.affectedOrderIds).not.toContain('ORD-1082')
    expect(result.workspace.stock.find((record) => record.locationId === 'north')?.available.value).toBe(14)
    expect(orderCoverage(result.workspace).find((line) => line.orderId === 'ORD-1086')?.covered).toBe(12)
  })

  it('a sent order takes its goods off the warehouse stock and stops needing stock', () => {
    const quiet: Workspace = { ...sampleWorkspace, disruptions: [], shipments: [], orders: [{ ...sampleWorkspace.orders[0], lines: [{ productId: 'harbor-blend', quantity: 5 }] }] }
    const result = sendAll(quiet, 'ORD-1082')
    if ('error' in result) throw new Error(result.error)
    expect(result.workspace.stock.find((record) => record.locationId === 'north')?.available.value).toBe(9)
    expect(orderCoverage(result.workspace)).toEqual([])
  })
})

describe('marking a delivery received', () => {
  // Approving the transfer sends 8 cases from South Hub (14 → 6) to North Hub (14 on hand).
  const transfer = () => {
    const booked = applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
    const shipment = booked.shipments.find((item) => item.transferStatus === 'booked')!
    const departed = departTransfer(booked, shipment.id, shipment.lines, SAMPLE_NOW)
    if ('error' in departed) throw new Error(departed.error)
    return departed.workspace
  }
  const transferId = (data: Workspace) => data.shipments.find((item) => item.transferBookingId)?.id ?? data.shipments.find((item) => item.supplierName === 'Transfer from South Hub')!.id
  const northStock = (data: Workspace) => data.stock.find((record) => record.locationId === 'north')?.available.value
  const arrivingAtNorth = (data: Workspace) => data.shipments.filter((item) => item.locationId === 'north').flatMap((item) => item.lines).reduce((total, line) => total + line.quantity, 0)
  const thursday = '2026-10-22T09:00:00+05:30'

  it('receiving all 8 cases does not free the same day receiving capacity', () => {
    const sent = transfer()
    const got = receiveDelivery(sent, transferId(sent), [{ productId: 'harbor-blend', quantity: 8 }], null, SAMPLE_NOW)
    expect(planOf(got, 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'rejected', quantity: 0, reason: { code: 'receiving-full', booked: 8 } })
  })

  it('a partial arrival uses its actual local day; the remainder reserves its own arrival day', () => {
    const data: Workspace = { ...sampleWorkspace, shipments: [], disruptions: [],
      orders: sampleWorkspace.orders.map((order) => ({ ...order, dueAt: '2026-10-20T16:00:00+05:30' })),
      routes: sampleWorkspace.routes.map((route) => ({ ...route, travelHours: { value: 1, evidence: sampleEvidence } })),
    }
    const sent = applyPlan(data, rehearse(data, SAMPLE_NOW).plans.find((plan) => plan.id === 'transfer:south-to-north:harbor-blend')!, SAMPLE_NOW)
    const shipment = sent.shipments.find((item) => item.id === transferId(sent))!
    const departed = departTransfer(sent, shipment.id, shipment.lines, SAMPLE_NOW)
    if ('error' in departed) throw new Error(departed.error)
    const departedId = transferId(departed.workspace)
    const got = receiveDelivery(departed.workspace, departedId, [{ productId: 'harbor-blend', quantity: 6 }], { arrivalAt: '2026-10-16T09:00:00+05:30' }, '2026-10-14T20:00:00Z')
    expect(rehearse(got, SAMPLE_NOW).plans.find((plan) => plan.id === 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'ready', quantity: 2, reason: { booked: 6 } })
    expect(rehearse(got, '2026-10-15T20:00:00Z').plans.find((plan) => plan.id === 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'ready', quantity: 6, reason: { booked: 2 } })
    const rest = got.shipments.find((shipment) => shipment.id === `${departedId}-REST`)!
    const finished = receiveDelivery(got, rest.id, rest.lines, null, '2026-10-15T20:00:00Z')
    expect(rehearse(finished, '2026-10-15T20:00:00Z').plans.find((plan) => plan.id === 'transfer:south-to-north:harbor-blend')).toMatchObject({ status: 'ready', quantity: 6, reason: { booked: 2 } })
  })

  it('all 8 arrive: North Hub goes from 14 to 22 and the transfer is no longer incoming, so it is never counted twice', () => {
    const sent = transfer()
    const before = arrivingAtNorth(sent)
    const got = receiveDelivery(sent, transferId(sent), [{ productId: 'harbor-blend', quantity: 8 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(22)
    expect(arrivingAtNorth(got)).toBe(before - 8)
  })

  it('6 of 8 arrive and the other 2 are still coming Thursday: 20 on hand, 2 still incoming for Thursday', () => {
    const sent = transfer()
    const got = receiveDelivery(sent, transferId(sent), [{ productId: 'harbor-blend', quantity: 6 }], { arrivalAt: thursday }, SAMPLE_NOW)
    expect(northStock(got)).toBe(20)
    expect(got.shipments.find((item) => item.id === `${transferId(sent)}-REST`)).toMatchObject({ lines: [{ productId: 'harbor-blend', quantity: 2 }], confirmedArrivalAt: thursday })
  })

  it('6 of 8 arrive and the other 2 are not coming: keep the 2 unresolved but stop forecasting them', () => {
    const sent = transfer()
    const got = receiveDelivery(sent, transferId(sent), [{ productId: 'harbor-blend', quantity: 6 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(20)
    const unresolved = got.shipments.find((item) => item.transferStatus === 'unresolved')!
    expect(unresolved.lines).toEqual([{ productId: 'harbor-blend', quantity: 2 }])
    expect(orderCoverage(got)).toEqual(orderCoverage({ ...got, shipments: got.shipments.filter((item) => item.id !== unresolved.id) }))
  })

  it('zero supplier arrival can close the incoming expectation without adding stock', () => {
    const before = sampleWorkspace.stock.map((item) => item.available.value)
    const movements = sampleWorkspace.movements.length
    const closed = receiveDelivery(sampleWorkspace, 'SH-204', [{ productId: 'harbor-blend', quantity: 0 }], null, SAMPLE_NOW)
    expect(closed.shipments.some((item) => item.id === 'SH-204')).toBe(false)
    expect(closed.stock.map((item) => item.available.value)).toEqual(before)
    expect(closed.movements).toHaveLength(movements)
  })

  it('returned unresolved transfer goods add source stock; lost goods do not', () => {
    const sent = transfer()
    const shipmentId = transferId(sent)
    const unresolved = receiveDelivery(sent, shipmentId, [{ productId: 'harbor-blend', quantity: 6 }], null, SAMPLE_NOW)
    const returned = resolveTransferFate(unresolved, shipmentId, [{ productId: 'harbor-blend', fate: 'returned' }], SAMPLE_NOW)
    if ('error' in returned) throw new Error(returned.error)
    expect(returned.workspace.stock.find((item) => item.locationId === 'south')?.available.value).toBe(8)
    expect(returned.workspace.movements.at(-1)).toMatchObject({ kind: 'transfer-return', quantity: 2 })
    const lost = resolveTransferFate(unresolved, shipmentId, [{ productId: 'harbor-blend', fate: 'lost' }], SAMPLE_NOW)
    if ('error' in lost) throw new Error(lost.error)
    expect(lost.workspace.stock.find((item) => item.locationId === 'south')?.available.value).toBe(6)
    expect(lost.workspace.movements.at(-1)).toMatchObject({ kind: 'transfer-loss', quantity: 2 })
  })
    it('a departed transfer can be received in more than one action without reusing the same receipt id', () => {
      const sent = transfer()
      const id = transferId(sent)
      const first = receiveDelivery(sent, id, [{ productId: 'harbor-blend', quantity: 3 }], { arrivalAt: thursday }, SAMPLE_NOW, 'RCV-FIRST')
      const rest = first.shipments.find((item) => item.id === `${id}-REST`)!
      const second = receiveDelivery(first, rest.id, [{ productId: 'harbor-blend', quantity: 2 }], { arrivalAt: thursday }, SAMPLE_NOW, 'RCV-SECOND')
      expect(northStock(second)).toBe(19)
      expect(second.movements.filter((movement) => movement.kind === 'receipt' && movement.fromLocationId === 'south').map((movement) => movement.quantity)).toEqual([3, 2])
      expect(second.shipments.find((item) => item.id === `${rest.id}-REST`)).toMatchObject({ transferStatus: 'in-transit', lines: [{ quantity: 3 }] })
    })

  it('the late shipment finally arrives: its stock counts and its delay is no longer a problem', () => {
    const got = receiveDelivery(sampleWorkspace, 'SH-204', [{ productId: 'harbor-blend', quantity: 24 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(38)
    expect(got.disruptions).toEqual([])
    expect(rehearse(got).impact.groups.filter((group) => group.kind === 'delay')).toEqual([])
    // 18 + 12 + 8 + 10 = 48 ordered against 38 on hand: the last 10 are still short, now as a plain shortage.
    expect(rehearse(got).impact.exposedQuantity).toBe(10)
  })

  it('this week\'s regular delivery arrives: stock goes up once and the delivery moves to next week, not later', () => {
    const monday = '2026-10-19T09:00:00+05:30'
    const weekly: Workspace = { ...sampleWorkspace, disruptions: [], shipments: [{ ...sampleWorkspace.shipments[0], id: 'WEEKLY', originalArrivalAt: monday, confirmedArrivalAt: monday, repeatEveryDays: 7, lines: [{ productId: 'harbor-blend', quantity: 10 }] }] }
    const got = receiveDelivery(weekly, 'WEEKLY', [{ productId: 'harbor-blend', quantity: 10 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(24)
    expect(Date.parse(got.shipments[0].confirmedArrivalAt)).toBe(Date.parse('2026-10-26T09:00:00+05:30'))
  })

  it('retrying the same regular receipt does not add the stock twice', () => {
    const monday = '2026-10-19T09:00:00+05:30'
    const weekly: Workspace = { ...sampleWorkspace, disruptions: [], shipments: [{ ...sampleWorkspace.shipments[0], id: 'WEEKLY', originalArrivalAt: monday, confirmedArrivalAt: monday, repeatEveryDays: 7, lines: [{ productId: 'harbor-blend', quantity: 10 }] }] }
    const first = receiveDelivery(weekly, 'WEEKLY', [{ productId: 'harbor-blend', quantity: 10 }], null, SAMPLE_NOW, 'RCV-WEEK-1')
    const retry = receiveDelivery(first, 'WEEKLY', [{ productId: 'harbor-blend', quantity: 10 }], null, SAMPLE_NOW, 'RCV-WEEK-1')
    expect(retry).toBe(first)
    expect(northStock(retry)).toBe(24)
  })

  it('two overdue weekly deliveries received on the same day are recorded as two different weeks', () => {
    // Due every Thursday from 8 Oct; nothing was marked until 15 Oct, when both 8 Oct's and 15 Oct's arrive.
    const thursday = '2026-10-08T09:00:00+05:30'
    const weekly: Workspace = { ...sampleWorkspace, disruptions: [], shipments: [{ ...sampleWorkspace.shipments[0], id: 'WEEKLY', originalArrivalAt: thursday, confirmedArrivalAt: thursday, repeatEveryDays: 7, lines: [{ productId: 'harbor-blend', quantity: 10 }] }] }
    const first = receiveDelivery(weekly, 'WEEKLY', [{ productId: 'harbor-blend', quantity: 10 }], null, SAMPLE_NOW, 'RCV-A')
    const second = receiveDelivery(first, 'WEEKLY', [{ productId: 'harbor-blend', quantity: 10 }], null, SAMPLE_NOW, 'RCV-B')
    const weeks = second.movements.filter((movement) => movement.kind === 'receipt').map((movement) => movement.occurrenceAt && Date.parse(movement.occurrenceAt))
    expect(weeks).toEqual([Date.parse(thursday), Date.parse('2026-10-15T09:00:00+05:30')])
  })

  it('a one-off delivery records no week', () => {
    const got = receiveDelivery({ ...sampleWorkspace, disruptions: [] }, 'SH-204', [{ productId: 'harbor-blend', quantity: 24 }], null, SAMPLE_NOW)
    expect(got.movements.find((movement) => movement.kind === 'receipt')?.occurrenceAt).toBeUndefined()
  })

  it('a delivery with two products adds each to its own count, and starts a count where there was none', () => {
    const data: Workspace = { ...sampleWorkspace, products: [...sampleWorkspace.products, { id: 'oat-milk', name: 'Oat Milk', unit: 'case', pack: '12 x 1 L' }], disruptions: [],
      shipments: [{ ...sampleWorkspace.shipments[0], lines: [{ productId: 'harbor-blend', quantity: 5 }, { productId: 'oat-milk', quantity: 7 }] }] }
    const got = receiveDelivery(data, 'SH-204', [{ productId: 'harbor-blend', quantity: 5 }, { productId: 'oat-milk', quantity: 7 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(19)
    expect(got.stock.find((record) => record.locationId === 'north' && record.productId === 'oat-milk')?.available.value).toBe(7)
  })
})

describe('a regular delivery that has not come', () => {
  const thursday = '2026-10-08T09:00:00+05:30'
  const weekly = { ...sampleWorkspace.shipments[0], id: 'WEEKLY', originalArrivalAt: thursday, confirmedArrivalAt: thursday, repeatEveryDays: 7 }

  it('is overdue since its scheduled date once that date has passed without a receipt', () => {
    expect(overdueSince(weekly, '2026-10-15T09:00:00+05:30')).toBe(thursday)
  })

  it('is not overdue before its date, and a one-off delivery is handled by Report late instead', () => {
    expect(overdueSince(weekly, '2026-10-08T08:00:00+05:30')).toBeNull()
    expect(overdueSince({ ...weekly, repeatEveryDays: undefined }, '2026-10-15T09:00:00+05:30')).toBeNull()
  })
})

describe('history', () => {
  const entry = (n: number) => ({ at: SAMPLE_NOW, kind: 'edit' as const, text: `change ${n}` })

  it('adds the newest entry at the end and keeps the earlier ones', () => {
    const once = addHistory(sampleWorkspace, entry(1))
    expect(addHistory(once, entry(2)).history?.map((item) => item.text)).toEqual(['change 1', 'change 2'])
  })

  it(`keeps only the newest ${LIMITS.history}, dropping the oldest`, () => {
    let data = sampleWorkspace
    for (let n = 1; n <= LIMITS.history + 3; n += 1) data = addHistory(data, entry(n))
    expect(data.history).toHaveLength(LIMITS.history)
    expect(data.history?.[0].text).toBe('change 4')
  })
})
