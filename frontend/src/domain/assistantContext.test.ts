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
    const later = Array.from({ length: 50 }, (_, index) => order(index, '2026-10-20T10:00:00+05:30'))
    const { facts, omittedFacts } = contextFor([...sampleWorkspace.orders, ...later])
    expect(omittedFacts).toBe(0)
    expect(facts.find((fact) => fact.id === 'orders-not-affected')?.value).toContain('51 orders')
  })

  it('shows prices in the workspace currency', () => {
    const { options } = contextFor(sampleWorkspace.orders)
    expect(options[0].cost).toContain('₹95')
  })
})
