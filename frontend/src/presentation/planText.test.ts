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
