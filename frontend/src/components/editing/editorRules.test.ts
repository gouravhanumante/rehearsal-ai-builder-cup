import { describe, expect, it } from 'vitest'
import type { Evidence } from '../../../../shared/planner/model'
import { sampleWorkspace } from '../../../../shared/planner/sample'
import { settingsForCountry } from '../../../../shared/planner/countries'
import { createFormat } from '../../presentation/format'
import { editorFor, type FieldSpec } from './editorConfigs'
import { changedFieldKeys, originAfterTyping, resolveEvidence } from './editorRules'

const now = '2026-10-15T09:00:00+05:30'
const typedBefore: Evidence = { kind: 'manual', source: 'Entered manually', recordedAt: '2026-10-14T09:00:00+05:30' }
const quote: Evidence = { kind: 'document', source: 'old-quote.pdf', recordedAt: '2026-10-14T09:00:00+05:30' }
const stock: FieldSpec = { key: 'stock', label: 'Stock', type: 'integer', required: false, extractable: true, isFact: true }

describe('when an edited value counts as verified', () => {
  it('a value read from a document and left alone is verified by that document', () => {
    expect(resolveEvidence('document', 20, null, 'quote.pdf', now)).toMatchObject({ kind: 'document', source: 'quote.pdf' })
  })

  it('changing a value that came from a document makes it unverified again', () => {
    const origin = originAfterTyping('21', '')
    expect(resolveEvidence(origin, 21, quote, 'quote.pdf', now)).toMatchObject({ kind: 'manual' })
  })

  it('typing the same value back keeps whatever proof it already had', () => {
    const origin = originAfterTyping('20', '20')
    expect(resolveEvidence(origin, 20, quote, null, now)).toBe(quote)
  })

  it('a blank optional value is unknown, with no proof at all', () => {
    expect(resolveEvidence('typed', null, quote, null, now)).toBeNull()
  })
})

describe('what the review step lists as a change', () => {
  it('lists a typed-in value that a document now proves, even though the number is the same', () => {
    const keys = changedFieldKeys([stock], { stock: '20' }, { stock: '20' }, { stock: 'document' }, { stock: typedBefore })
    expect(keys).toEqual(['stock'])
  })

  it('does not list a value the user typed and then put back', () => {
    const keys = changedFieldKeys([stock], { stock: '20' }, { stock: '20' }, { stock: 'unchanged' }, { stock: typedBefore })
    expect(keys).toEqual([])
  })
})

describe('order proof', () => {
  const editor = editorFor({ type: 'order', orderId: 'ORD-1082' }, sampleWorkspace, createFormat(settingsForCountry('IN')))
  const original = sampleWorkspace.orders[0]
  const quantity = 'line:harbor-blend'

  it('one typed-in detail makes the whole order unverified', () => {
    const next = editor?.apply(
      { customer: original.customer, [quantity]: 20, dueAt: original.dueAt, locationId: 'north', priority: original.priority },
      { customer: original.evidence, [quantity]: { kind: 'manual', source: 'Entered manually', recordedAt: now }, dueAt: original.evidence, locationId: null, priority: null },
    )
    expect(next?.orders[0]).toMatchObject({ lines: [{ productId: 'harbor-blend', quantity: 20 }], evidence: { kind: 'manual' } })
  })

  it('changing only the priority does not make the order unverified; it is the user’s own choice', () => {
    const next = editor?.apply(
      { customer: original.customer, [quantity]: 18, dueAt: original.dueAt, locationId: 'north', priority: 'standard' },
      { customer: original.evidence, [quantity]: original.evidence, dueAt: original.evidence, locationId: null, priority: { kind: 'manual', source: 'Entered manually', recordedAt: now } },
    )
    expect(next?.orders[0]).toMatchObject({ priority: 'standard', evidence: original.evidence })
  })
})
