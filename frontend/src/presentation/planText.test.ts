import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../../shared/planner/model'
import { rehearse } from '../../../shared/planner/plan'
import { sampleWorkspace } from '../../../shared/planner/sample'
import { createFormat } from './format'
import { createWording } from './planText'

// The sample transfer moves 8 cases for ₹95 (₹55 trip + 8 × ₹5).
const transferWarning = (pricePerCase: number | null) => {
  const workspace: Workspace = { ...sampleWorkspace, products: sampleWorkspace.products.map((product) => ({ ...product, pricePerUnit: pricePerCase })) }
  const plan = rehearse(workspace).plans.find((item) => item.id === 'transfer:south-to-north:harbor-blend')
  if (!plan) throw new Error('no transfer')
  return createWording(workspace, createFormat(workspace.settings)).planText(plan).worthNote
}

describe('is a fix worth what it costs?', () => {
  it('warns when it costs more than the goods it saves sell for: ₹95 to save 8 cases worth ₹10 each (₹80)', () => {
    expect(transferWarning(10)).toMatch(/more than the 8 cases it saves are worth/)
  })

  it('stays quiet when the goods are worth more (₹20 a case is ₹160), or when no selling price is set', () => {
    expect(transferWarning(20)).toBeNull()
    expect(transferWarning(null)).toBeNull()
  })
})

describe('transfer facts shown to the user', () => {
  it('labels a manually entered customer travel duration unverified and links to its location', () => {
    const workspace: Workspace = {
      ...sampleWorkspace,
      locations: sampleWorkspace.locations.map((location) => location.id === 'north' ? {
        ...location,
        customerTravelHours: { value: 1, evidence: { kind: 'manual', source: 'Entered manually', recordedAt: '2026-10-15T09:00:00+05:30' } },
      } : location),
    }
    const plan = rehearse(workspace).plans.find((item) => item.id === 'transfer:south-to-north:harbor-blend')!
    const words = createWording(workspace, createFormat(workspace.settings))
    const travelFact = plan.unverified.find((fact) => fact.type === 'customer-travel')!
    expect(words.planText(plan).statusLabel).toBe('Ready · unverified')
    expect(words.unverifiedText(travelFact)).toEqual({
      label: 'North Hub customer travel time', value: '1 hour', target: { type: 'location', locationId: 'north' },
    })
  })

  it('does not describe used receiving capacity as goods still incoming', () => {
    const workspace: Workspace = { ...sampleWorkspace, movements: [...sampleWorkspace.movements, { id: 'RCV-earlier', kind: 'receipt', locationId: 'north', productId: 'harbor-blend', quantity: 6, at: '2026-10-15T08:50:00+05:30', evidence: sampleWorkspace.movements[0].evidence, shipmentId: 'TR-earlier', fromLocationId: 'south' }] }
    const plan = rehearse(workspace).plans.find((item) => item.id === 'transfer:south-to-north:harbor-blend')!
    expect(createWording(workspace, createFormat(workspace.settings)).planText(plan).detail).toMatch(/received or booked/)
  })

  it('does not claim a transfer for a later customer arrives before an already-covered priority order', () => {
    const workspace: Workspace = { ...sampleWorkspace, shipments: [], disruptions: [], orders: [
      { ...sampleWorkspace.orders[0], lines: [{ productId: 'harbor-blend', quantity: 14 }], dueAt: '2026-10-15T10:00:00+05:30' },
      { ...sampleWorkspace.orders[1], lines: [{ productId: 'harbor-blend', quantity: 10 }], dueAt: '2026-10-16T16:00:00+05:30' },
    ] }
    const plan = rehearse(workspace).plans.find((item) => item.id === 'transfer:south-to-north:harbor-blend')!
    const text = createWording(workspace, createFormat(workspace.settings)).planText(plan)
    expect(`${text.detail} ${text.description}`).not.toMatch(/before the priority order/)
    expect(text.detail).toMatch(/warehouse before the affected orders' due times/)
    expect(text.detail).toMatch(/customer arrival .* is unconfirmed/i)
    expect(text.description).toMatch(/before the affected orders' due times/)
    expect(text.detail).toMatch(/Book by Fri, 16 Oct, 1:00 pm/)
  })
})
