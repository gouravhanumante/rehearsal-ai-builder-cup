import { describe, expect, it } from 'vitest'
import { cancelRemaining, correctMovement, countStock, reopenOrder, remainingLines, sendOrder, sentLines, type Result } from './ledger.js'
import type { Order, Workspace } from './model.js'
import { orderCoverage, rehearse } from './plan.js'
import { SAMPLE_NOW, sampleEvidence, sampleWorkspace } from './sample.js'
import { sliceForPlan } from './slice.js'
import { parseWorkspace } from './validate.js'

const ok = (result: Result): Workspace => {
  if ('error' in result) throw new Error(result.error)
  return result.workspace
}
const later = (minutes: number) => new Date(Date.parse(SAMPLE_NOW) + minutes * 60_000).toISOString()
const order = (id: string, quantity: number, extra: Partial<Order> = {}): Order => ({
  id, customer: id, locationId: 'north', dueAt: '2026-10-17T17:00:00+05:30', priority: 'standard',
  lines: [{ productId: 'harbor-blend', quantity }], evidence: sampleEvidence, ...extra,
})
// North Hub counts 12 cases; Green Leaf ordered 10 and accepts deliveries in parts.
const start = (orders: Order[] = [order('GREEN', 10, { splitAllowed: true })]): Workspace => ok(countStock(
  { ...sampleWorkspace, orders, shipments: [], disruptions: [] }, 'north', 'harbor-blend', 12, sampleEvidence, SAMPLE_NOW))
const north = (data: Workspace) => data.stock.find((record) => record.locationId === 'north')?.available.value
const sendSix = (data: Workspace, id = 'D1') => ok(sendOrder(data, 'GREEN', [{ productId: 'harbor-blend', quantity: 6 }], later(10), id))

describe('sending part of an order', () => {
  it('6 of 10 sent: stock 12 goes to 6, 4 still to send, and the planner only looks for 4', () => {
    const sent = sendSix(start())
    expect(north(sent)).toBe(6)
    expect(remainingLines(sent, sent.orders[0])).toEqual([{ productId: 'harbor-blend', quantity: 4 }])
    expect(orderCoverage(sent).find((line) => line.orderId === 'GREEN')).toMatchObject({ ordered: 4, covered: 4 })
  })

  it('the same send submitted twice is recorded once', () => {
    const twice = sendSix(sendSix(start()))
    expect(north(twice)).toBe(6)
    expect(sentLines(twice, 'GREEN')).toEqual([{ productId: 'harbor-blend', quantity: 6 }])
  })

  it('two real sends of the same size are both recorded', () => {
    const data = ok(sendOrder(sendSix(start()), 'GREEN', [{ productId: 'harbor-blend', quantity: 4 }], later(20), 'D2'))
    expect(north(data)).toBe(2)
    expect(remainingLines(data, data.orders[0])).toEqual([])
  })

  it('a part send needs the customer to accept parts; the whole remainder never does', () => {
    for (const splitAllowed of [undefined, false]) {
      const data = start([order('GREEN', 10, { splitAllowed })])
      expect(sendOrder(data, 'GREEN', [{ productId: 'harbor-blend', quantity: 6 }], later(10))).toHaveProperty('error')
      expect(north(ok(sendOrder(data, 'GREEN', [{ productId: 'harbor-blend', quantity: 10 }], later(10))))).toBe(2)
    }
  })

  it('cannot send more than the order still needs, or more than is counted', () => {
    expect(sendOrder(sendSix(start()), 'GREEN', [{ productId: 'harbor-blend', quantity: 5 }], later(20))).toHaveProperty('error')
    const big = start([order('BIG', 20, { splitAllowed: true })])
    expect(sendOrder(big, 'BIG', [{ productId: 'harbor-blend', quantity: 13 }], later(10))).toHaveProperty('error')
  })

  it('one product fully sent and another partly: only the unsent part is still needed', () => {
    const data: Workspace = ok(countStock(start([order('MIX', 0, { splitAllowed: true, lines: [{ productId: 'harbor-blend', quantity: 5 }, { productId: 'oat', quantity: 8 }] })]),
      'north', 'oat', 8, sampleEvidence, SAMPLE_NOW))
    const sent = ok(sendOrder(data, 'MIX', [{ productId: 'harbor-blend', quantity: 5 }, { productId: 'oat', quantity: 3 }], later(10)))
    expect(remainingLines(sent, sent.orders[0])).toEqual([{ productId: 'oat', quantity: 5 }])
  })

  // 12 counted; Green Leaf 10 (3 sent, so 9 left on the shelf and 7 still owed); Hill Cafe 5 due later.
  it('after a part send, the problem view and the Orders page agree that Hill Cafe is 3 short', () => {
    const data = start([order('GREEN', 10, { splitAllowed: true }), order('HILL', 5, { dueAt: '2026-10-18T17:00:00+05:30' })])
    const sent = ok(sendOrder(data, 'GREEN', [{ productId: 'harbor-blend', quantity: 3 }], later(10)))
    expect(north(sent)).toBe(9)
    expect(orderCoverage(sent).find((line) => line.orderId === 'HILL')).toMatchObject({ ordered: 5, covered: 2 })
    expect(rehearse(sent, later(20)).impact).toMatchObject({ affectedOrderIds: ['HILL'], exposedQuantity: 3 })
  })

  // Green Leaf had 3 sent from East, then moved to South (10 counted) next to Hill Cafe's 5: 2 short at South.
  // East is not part of the North-to-South check, so the server never sees that send.
  it('the server check sees a moved, partly sent order as owing only what is left', () => {
    const route = { id: 'north-to-south', fromLocationId: 'north', toLocationId: 'south', arrivalAt: { value: null, evidence: null }, travelHours: { value: 1, evidence: sampleEvidence }, quotes: [] }
    const east = { id: 'east', name: 'East Store', kind: 'store' as const, receivingLimitPerDay: null }
    const base = { ...start([order('GREEN', 10, { splitAllowed: true, locationId: 'east' }), order('HILL', 5, { locationId: 'south', dueAt: '2026-10-18T17:00:00+05:30' })]), routes: [route], locations: [...sampleWorkspace.locations, east] }
    const counted = ok(countStock(ok(countStock(base, 'south', 'harbor-blend', 10, sampleEvidence, SAMPLE_NOW)), 'east', 'harbor-blend', 3, sampleEvidence, SAMPLE_NOW))
    const sent = ok(sendOrder(counted, 'GREEN', [{ productId: 'harbor-blend', quantity: 3 }], later(10)))
    const moved: Workspace = { ...sent, orders: sent.orders.map((item) => item.id === 'GREEN' ? { ...item, locationId: 'south' } : item) }
    const plan = rehearse(moved, later(20)).plans.find((item) => item.id === 'transfer:north-to-south:harbor-blend')!
    expect(plan).toMatchObject({ status: 'ready', quantity: 2 })
    const slice = parseWorkspace(JSON.parse(JSON.stringify(sliceForPlan(moved, plan.id))))!
    expect(rehearse(slice, later(20)).plans.find((item) => item.id === plan.id)).toEqual(plan)
  })
})

describe('correcting one send', () => {
  it('recorded 6 but only 4 left: 2 come back, and another customer\'s send is untouched', () => {
    const both = start([order('GREEN', 10, { splitAllowed: true }), order('HILL', 3)])
    const sent = ok(sendOrder(sendSix(both), 'HILL', [{ productId: 'harbor-blend', quantity: 3 }], later(15)))
    expect(north(sent)).toBe(3)
    const fixed = ok(correctMovement(sent, 'D1:harbor-blend', 4, later(30)))
    expect(north(fixed)).toBe(5)
    expect(sentLines(fixed, 'GREEN')).toEqual([{ productId: 'harbor-blend', quantity: 4 }])
    expect(sentLines(fixed, 'HILL')).toEqual([{ productId: 'harbor-blend', quantity: 3 }])
    expect(remainingLines(fixed, fixed.orders[0])).toEqual([{ productId: 'harbor-blend', quantity: 6 }])
  })

  it('after a later shelf count of 8, fixing the mistake does not add the 2 again', () => {
    const recounted = ok(countStock(sendSix(start()), 'north', 'harbor-blend', 8, sampleEvidence, later(20)))
    const fixed = ok(correctMovement(recounted, 'D1:harbor-blend', 4, later(30)))
    expect(north(fixed)).toBe(8)
    expect(remainingLines(fixed, fixed.orders[0])).toEqual([{ productId: 'harbor-blend', quantity: 6 }])
  })

  it('can correct to 0, but not to more than the order asked for or more than is on the shelf', () => {
    const sent = sendSix(start())
    expect(north(ok(correctMovement(sent, 'D1:harbor-blend', 0, later(30))))).toBe(12)
    expect(correctMovement(sent, 'D1:harbor-blend', 11, later(30))).toHaveProperty('error')
    const busy = ok(sendOrder(sendSix(start([order('GREEN', 10, { splitAllowed: true }), order('HILL', 6)])), 'HILL', [{ productId: 'harbor-blend', quantity: 6 }], later(15)))
    expect(correctMovement(busy, 'D1:harbor-blend', 7, later(30))).toHaveProperty('error')
  })
})

describe('cancelling what is left', () => {
  it('6 sent then the rest cancelled: stock stays 6 and nothing is still needed; reopening brings back only the 4', () => {
    const cancelled = ok(cancelRemaining(sendSix(start()), 'GREEN', later(20)))
    expect(north(cancelled)).toBe(6)
    expect(remainingLines(cancelled, cancelled.orders[0])).toEqual([])
    expect(orderCoverage(cancelled)).toEqual([])
    const reopened = ok(reopenOrder(cancelled, 'GREEN'))
    expect(north(reopened)).toBe(6)
    expect(remainingLines(reopened, reopened.orders[0])).toEqual([{ productId: 'harbor-blend', quantity: 4 }])
  })
})

describe('saved data', () => {
  it('stock is always worked out again from movements, so an edited stock number cannot be smuggled in', () => {
    const sent = sendSix(start())
    const tampered = { ...sent, stock: sent.stock.map((record) => ({ ...record, available: { ...record.available, value: 500 } })) }
    expect(north(parseWorkspace(JSON.parse(JSON.stringify(tampered)))!)).toBe(6)
  })

  it('refuses movements that would leave stock below zero, repeated ids, or a correction of nothing', () => {
    const sent = sendSix(start())
    const dispatch = sent.movements.at(-1)!
    expect(parseWorkspace({ ...sent, movements: [...sent.movements, { ...dispatch, id: 'D9', quantity: 7 }] })).toBeNull()
    expect(parseWorkspace({ ...sent, movements: [...sent.movements, dispatch] })).toBeNull()
    expect(parseWorkspace({ ...sent, movements: [...sent.movements, { ...dispatch, id: 'C9', corrects: 'missing' }] })).toBeNull()
  })
})
