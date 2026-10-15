import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../../shared/planner/model'
import { applyPlan } from '../../../shared/planner/apply'
import { rehearse } from '../../../shared/planner/plan'
import { SAMPLE_NOW, sampleEvidence, sampleWorkspace } from '../../../shared/planner/sample'
import { approvalMessages } from './approvalMessages'
import { createFormat } from './format'
import { createWording } from './planText'

const messagesFor = (data: Workspace, planId: string) => {
  const plan = rehearse(data, SAMPLE_NOW).plans.find((item) => item.id === planId)
  if (!plan) throw new Error(`no plan ${planId}`)
  const format = createFormat(data.settings)
  return approvalMessages(plan, data, applyPlan(data, plan, SAMPLE_NOW), format, createWording(data, format), SAMPLE_NOW)
}
const withCustomerTravel = (data: Workspace): Workspace => ({
  ...data,
  locations: data.locations.map((location) => location.id === 'north' ? { ...location, customerTravelHours: { value: 1, evidence: sampleEvidence } } : location),
})

describe('messages ready to send after approving', () => {
  it('a plain shortage never invents a supplier delay, including when a different product is delayed', () => {
    const plain: Workspace = withCustomerTravel({ ...sampleWorkspace, shipments: [], disruptions: [] })
    const unrelated: Workspace = { ...plain, shipments: [{ ...sampleWorkspace.shipments[0], lines: [{ productId: 'oat', quantity: 24 }] }], disruptions: sampleWorkspace.disruptions }
    for (const workspace of [plain, unrelated]) {
      const notes = messagesFor(workspace, 'transfer:south-to-north:harbor-blend').slice(1)
      expect(notes.length).toBeGreaterThan(0)
      expect(notes.every((note) => !note.body.includes('a supplier delivery to us is late'))).toBe(true)
      expect(notes[0].body).toContain('We can deliver 14 cases of Harbor Blend Coffee on time.')
      expect(notes.every((note) => note.body.includes('We will confirm when'))).toBe(true)
    }
  })

  it('does not promise customer arrival when travel time is unknown', () => {
    const notes = messagesFor({ ...sampleWorkspace, shipments: [], disruptions: [] }, 'transfer:south-to-north:harbor-blend').slice(1)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((note) => note.body.includes('Customer arrival time is not confirmed'))).toBe(true)
    expect(notes.every((note) => !note.body.includes('on time'))).toBe(true)
  })

  it('mentions a reported supplier delay only for an order whose deadline that delivery actually missed', () => {
    const notes = messagesFor(withCustomerTravel(sampleWorkspace), 'transfer:south-to-north:harbor-blend').slice(1)
    expect(notes.every((note) => note.body.includes('a supplier delivery to us is late'))).toBe(true)
    const alreadyLate: Workspace = { ...withCustomerTravel(sampleWorkspace), shipments: sampleWorkspace.shipments.map((shipment) => ({ ...shipment, originalArrivalAt: '2026-10-18T09:00:00+05:30', confirmedArrivalAt: '2026-10-20T09:00:00+05:30' })) }
    const laterShipmentNotes = messagesFor(alreadyLate, 'transfer:south-to-north:harbor-blend').filter((note) => ['Harbor Market', 'Daily Goods Co.'].includes(note.to))
    expect(laterShipmentNotes).toHaveLength(2)
    expect(laterShipmentNotes.every((note) => !note.body.includes('a supplier delivery to us is late'))).toBe(true)
  })

  // Sample: North Hub has 14, needs 18 (Common Ground, Thu 2 pm), 12 (Harbor Market) and 8 (Daily Goods, both Fri noon).
  it('a transfer asks South Hub to send exactly the approved 8 cases, arriving when the plan says', () => {
    const [transfer] = messagesFor(withCustomerTravel(sampleWorkspace), 'transfer:south-to-north:harbor-blend')
    expect(transfer.to).toBe('South Hub team')
    expect(transfer.body).toContain('Please send 8 cases of Harbor Blend Coffee to North Hub. If it leaves now it arrives Thu, 15 Oct, 12:00 pm; it must leave by Thu, 15 Oct, 10:00 am at the latest to arrive in time.')
  })

  it('after booking 8, the transfer is not described as already arrived and every still-short customer gets a note', () => {
    const notes = messagesFor(withCustomerTravel(sampleWorkspace), 'transfer:south-to-north:harbor-blend').slice(1)
    expect(notes.map((note) => note.to)).toEqual(['Common Ground Cafe', 'Harbor Market', 'Daily Goods Co.'])
    expect(notes[0].body).toContain('We can deliver 14 cases of Harbor Blend Coffee on time.')
    expect(notes[0].body).toContain('remaining 4 cases of Harbor Blend Coffee should follow after our next delivery arrives on Fri, 16 Oct, 4:00 pm.')
    expect(notes.slice(1).every((note) => note.body.includes("We can't deliver it on time."))).toBe(true)
  })

  it('never invents a date: with no later delivery on its way, the note says the date will follow', () => {
    const noLaterDelivery: Workspace = { ...sampleWorkspace, shipments: sampleWorkspace.shipments.map((item) => ({ ...item, confirmedArrivalAt: '2026-10-14T09:00:00+05:30' })), disruptions: [] }
    const notes = messagesFor(noLaterDelivery, 'transfer:south-to-north:harbor-blend').slice(1)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes.every((note) => note.body.includes('We will confirm when'))).toBe(true)
  })

  it('a purchase order states the quantity, the quoted price and delivery charge, the total and the arrival, to the supplier\'s email', () => {
    const offer = { productId: 'harbor-blend', locationId: 'north', available: { value: 30, evidence: sampleEvidence }, pricePerUnit: { value: 40, evidence: sampleEvidence }, arrivalAt: { value: '2026-10-15T11:00:00+05:30', evidence: sampleEvidence }, deliveryCharge: { value: 200, evidence: sampleEvidence } }
    const data: Workspace = { ...sampleWorkspace, routes: [], suppliers: [{ id: 'supplier-b', name: 'Supplier B', contact: 'orders@supplierb.in', offers: [offer] }] }
    const [order] = messagesFor(data, 'supplier:supplier-b:harbor-blend:north')
    expect(order).toMatchObject({ to: 'Supplier B', email: 'orders@supplierb.in', subject: 'Order: 24 cases of Harbor Blend Coffee to North Hub' })
    expect(order.body).toContain('Please supply 24 cases of Harbor Blend Coffee at ₹40 per case, plus ₹200 delivery, delivered to North Hub by Thu, 15 Oct, 11:00 am, as you offered. That is ₹1,160 in total.')
  })
})
