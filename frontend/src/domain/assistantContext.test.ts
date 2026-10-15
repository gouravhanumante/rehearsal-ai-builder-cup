import { describe, expect, it } from 'vitest'
import { settingsForCountry } from '../../../shared/planner/countries'
import type { Order, Workspace } from '../../../shared/planner/model'
import { rehearse } from '../../../shared/planner/plan'
import { sampleEvidence, sampleWorkspace } from '../../../shared/planner/sample'
import { createFormat } from '../presentation/format'
import { createWording } from '../presentation/planText'
import { buildAssistantContext, MAX_ASSISTANT_FACTS } from './assistantContext'

const order = (index: number, dueAt: string): Order => ({
  id: `ORD-${2000 + index}`, customer: `Customer ${index}`, locationId: 'north', dueAt, priority: 'standard',
  lines: [{ productId: 'harbor-blend', quantity: 1 }], evidence: sampleEvidence,
})
const contextFor = (orders: Order[]) => {
  const workspace: Workspace = { ...sampleWorkspace, orders }
  const format = createFormat(settingsForCountry('IN'))
  return buildAssistantContext(workspace, rehearse(workspace), format, createWording(workspace, format))
}

describe('what Ask AI is allowed to see', () => {
  it('never drops facts silently: if anything is left out, it says how many', () => {
    const many = Array.from({ length: 60 }, (_, index) => order(index, '2026-10-15T13:00:00+05:30'))
    const { facts, omittedFacts } = contextFor(many)
    expect(facts.length).toBeLessThanOrEqual(MAX_ASSISTANT_FACTS)
    expect(omittedFacts).toBeGreaterThan(0)
    expect(facts.at(-1)).toMatchObject({ id: 'not-shown', value: expect.stringContaining(String(omittedFacts)) })
  })

  it('keeps stock, transfer and supplier facts even when there are many orders', () => {
    const many = Array.from({ length: 60 }, (_, index) => order(index, '2026-10-15T13:00:00+05:30'))
    const ids = contextFor(many).facts.map((fact) => fact.id)
    expect(ids).toEqual(expect.arrayContaining([
      'delay-SH-204', 'stock-north-harbor-blend', 'stock-south-harbor-blend', 'route-south-to-north',
      'supplier-b-harbor-blend-stock', 'supplier-b-harbor-blend-price', 'supplier-b-harbor-blend-arrival',
    ]))
  })

  it('sums up orders that the delay does not touch instead of listing each one', () => {
    // 50 orders at South Hub, which has stock for all of them.
    const later = Array.from({ length: 50 }, (_, index) => ({ ...order(index, '2026-10-20T10:00:00+05:30'), locationId: 'south' }))
    const workspace: Workspace = {
      ...sampleWorkspace,
      locations: sampleWorkspace.locations.map((location) => location.id === 'south' ? { ...location, customerTravelHours: { value: 1, evidence: sampleEvidence } } : location),
      orders: [...sampleWorkspace.orders, ...later],
      stock: sampleWorkspace.stock.map((record) => record.locationId === 'south' ? { ...record, available: { ...record.available, value: 100 } } : record),
    }
    const format = createFormat(settingsForCountry('IN'))
    const { facts, omittedFacts } = buildAssistantContext(workspace, rehearse(workspace), format, createWording(workspace, format))
    expect(omittedFacts).toBe(0)
    expect(facts.find((fact) => fact.id === 'orders-not-affected')?.value).toContain('50 orders')
  })

  it('shows prices in the workspace currency', () => {
    const { options } = contextFor(sampleWorkspace.orders)
    expect(options[0].cost).toContain('₹95')
  })

  it('does not tell the chat which details were typed in: a typed stock count is just a known fact', () => {
    const typed = { kind: 'manual' as const, source: 'Entered manually', recordedAt: '2026-10-15T09:00:00+05:30' }
    const workspace: Workspace = { ...sampleWorkspace, stock: sampleWorkspace.stock.map((record) => ({ ...record, available: { ...record.available, evidence: typed } })) }
    const format = createFormat(settingsForCountry('IN'))
    const { facts, options, optionLabels } = buildAssistantContext(workspace, rehearse(workspace), format, createWording(workspace, format))
    const sent = JSON.stringify({ facts, options })
    expect(sent).not.toMatch(/unverified|typed[- ]in/i)
    expect(facts.find((fact) => fact.id === 'stock-north-harbor-blend')?.evidenceStatus).toBe('confirmed')
    expect(Object.values(optionLabels)).not.toContain('Ready · unverified')
  })
})
