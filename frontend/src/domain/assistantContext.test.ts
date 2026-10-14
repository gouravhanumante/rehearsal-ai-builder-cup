import { describe, expect, it } from 'vitest'
import { distributorDemo, sampleEvidence, type DemoOrder } from '../data/distributorDemo'
import { buildAssistantContext, MAX_ASSISTANT_FACTS } from './assistantContext'
import { rehearseDistributor } from './rehearseDistributor'

const order = (index: number, dueAt: string): DemoOrder => ({
  id: `ORD-${2000 + index}`, customer: `Customer ${index}`, productId: 'harbor-blend', dueAt, cases: 1, priority: 'standard', evidence: sampleEvidence,
})
const contextFor = (orders: DemoOrder[]) => {
  const data = { ...distributorDemo, orders }
  return buildAssistantContext(data, rehearseDistributor(data))
}

describe('what Ask AI is allowed to see', () => {
  it('never drops facts silently: if anything is left out, it says how many', () => {
    const many = Array.from({ length: 60 }, (_, index) => order(index, '2026-10-15T13:00:00+05:30'))
    const { facts, omittedFacts } = contextFor(many)
    expect(facts.length).toBeLessThanOrEqual(MAX_ASSISTANT_FACTS)
    expect(omittedFacts).toBeGreaterThan(0)
    expect(facts.at(-1)).toMatchObject({ id: 'not-shown', value: expect.stringContaining(String(omittedFacts)) })
  })

  it('keeps stock and supplier facts even when there are many orders', () => {
    const many = Array.from({ length: 60 }, (_, index) => order(index, '2026-10-15T13:00:00+05:30'))
    const ids = contextFor(many).facts.map((fact) => fact.id)
    expect(ids).toEqual(expect.arrayContaining(['shipment', 'north-stock', 'south-stock', 'supplier-b-stock', 'supplier-b-price', 'supplier-b-arrival']))
  })

  it('sums up orders that the delay does not touch instead of listing each one', () => {
    const later = Array.from({ length: 50 }, (_, index) => order(index, '2026-10-20T10:00:00+05:30'))
    const { facts, omittedFacts } = contextFor([...distributorDemo.orders, ...later])
    expect(omittedFacts).toBe(0)
    expect(facts.find((fact) => fact.id === 'orders-after-arrival')?.value).toContain('51 orders')
  })
})
