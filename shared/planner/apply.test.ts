import { describe, expect, it } from 'vitest'
import type { Workspace } from './model.js'
import { addHistory, applyPlan, receiveDelivery, setOrderStatus } from './apply.js'
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

describe('marking a delivery received', () => {
  // Approving the transfer sends 8 cases from South Hub (14 → 6) to North Hub (14 on hand).
  const transfer = () => applyPlan(sampleWorkspace, planOf(sampleWorkspace, 'transfer:south-to-north:harbor-blend'), SAMPLE_NOW)
  const transferId = (data: Workspace) => data.shipments.find((item) => item.supplierName === 'Transfer from South Hub')!.id
  const northStock = (data: Workspace) => data.stock.find((record) => record.locationId === 'north')?.available.value
  const arrivingAtNorth = (data: Workspace) => data.shipments.filter((item) => item.locationId === 'north').flatMap((item) => item.lines).reduce((total, line) => total + line.quantity, 0)
  const thursday = '2026-10-22T09:00:00+05:30'

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

  it('6 of 8 arrive and the other 2 are not coming: 20 on hand and nothing left incoming from that transfer', () => {
    const sent = transfer()
    const got = receiveDelivery(sent, transferId(sent), [{ productId: 'harbor-blend', quantity: 6 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(20)
    expect(got.shipments.some((item) => item.id.startsWith(transferId(sent)))).toBe(false)
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

  it('a delivery with two products adds each to its own count, and starts a count where there was none', () => {
    const data: Workspace = { ...sampleWorkspace, products: [...sampleWorkspace.products, { id: 'oat-milk', name: 'Oat Milk', unit: 'case', pack: '12 x 1 L' }], disruptions: [],
      shipments: [{ ...sampleWorkspace.shipments[0], lines: [{ productId: 'harbor-blend', quantity: 5 }, { productId: 'oat-milk', quantity: 7 }] }] }
    const got = receiveDelivery(data, 'SH-204', [{ productId: 'harbor-blend', quantity: 5 }, { productId: 'oat-milk', quantity: 7 }], null, SAMPLE_NOW)
    expect(northStock(got)).toBe(19)
    expect(got.stock.find((record) => record.locationId === 'north' && record.productId === 'oat-milk')?.available.value).toBe(7)
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
