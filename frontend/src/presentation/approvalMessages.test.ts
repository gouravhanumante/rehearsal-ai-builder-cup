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

describe('messages ready to send after approving', () => {
  // Sample: North Hub has 14, needs 18 (Common Ground, Thu 2 pm), 12 (Harbor Market) and 8 (Daily Goods, both Fri noon).
  it('a transfer asks South Hub to send exactly the approved 8 cases, arriving when the plan says', () => {
    const [transfer] = messagesFor(sampleWorkspace, 'transfer:south-to-north:harbor-blend')
    expect(transfer.to).toBe('South Hub team')
    expect(transfer.body).toContain('Please send 8 cases of Harbor Blend Coffee to North Hub. If it leaves now it arrives Thu, 15 Oct, 12:00 pm; it must leave by Thu, 15 Oct, 11:00 am at the latest to arrive in time.')
  })

  it('after moving 8, Harbor Market (4 of 12 on time) and Daily Goods (none) get a note; Common Ground, now covered, does not', () => {
    const notes = messagesFor(sampleWorkspace, 'transfer:south-to-north:harbor-blend').slice(1)
    expect(notes.map((note) => note.to)).toEqual(['Harbor Market', 'Daily Goods Co.'])
    expect(notes[0].body).toContain('We can deliver 4 cases of Harbor Blend Coffee on time.')
    expect(notes[0].body).toContain('remaining 8 cases of Harbor Blend Coffee should follow after our next delivery arrives on Fri, 16 Oct, 3:00 pm.')
    expect(notes[1].body).toContain("We can't deliver it on time.")
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
