import { describe, expect, it } from 'vitest'
import { sampleWorkspace } from '../../../shared/planner/sample'
import { migrateV1, readSaved } from './demoStore'

const typed = { kind: 'manual' as const, source: 'Entered manually', recordedAt: '2026-10-15T09:00:00+05:30' }
const sample = { kind: 'sample' as const, source: 'Sample data', recordedAt: '2026-10-15T08:42:00+05:30' }
const legacyEdits = {
  version: 1,
  inventory: { northCases: { value: 9, evidence: typed }, southUnallocatedCases: { value: 14, evidence: sample } },
  orders: [{ id: 'ORD-1082', customer: 'Common Ground Cafe', dueAt: '2026-10-15T14:00:00+05:30', cases: 20, priority: 'protected', evidence: typed }],
  suppliers: [{ id: 'supplier-b', name: 'Supplier B', availableCases: { value: 20, evidence: typed }, pricePerCase: { value: null, evidence: null }, arrivalAt: { value: null, evidence: null } }],
}

describe('saved demo edits', () => {
  it('restores edits saved in this browser', () => {
    const edited = { ...sampleWorkspace, businessName: 'Edited Supply' }
    expect(readSaved(JSON.stringify(edited), null)).toEqual({ workspace: edited, notice: null })
  })

  it('carries edits from the first version into the new format, keeping where each value came from', () => {
    const migrated = migrateV1(legacyEdits)
    expect(migrated?.stock.find((record) => record.locationId === 'north')?.available).toEqual({ value: 9, evidence: typed })
    expect(migrated?.orders[0]).toMatchObject({ lines: [{ productId: 'harbor-blend', quantity: 20 }], evidence: typed })
    expect(migrated?.suppliers[0].offers[0].available).toEqual({ value: 20, evidence: typed })
  })

  it('tells the user when it moved their edits', () => {
    expect(readSaved(null, JSON.stringify(legacyEdits)).notice).toContain('moved to the new format')
  })

  it('never drops damaged saved data silently: it loads the sample and says so', () => {
    const result = readSaved('{not json', null)
    expect(result.workspace).toBe(sampleWorkspace)
    expect(result.notice).toContain('could not be read')
  })

  it('rejects a stock count with no record of where it came from', () => {
    const broken = { ...sampleWorkspace, stock: [{ locationId: 'north', productId: 'harbor-blend', available: { value: 9 } }] }
    expect(readSaved(JSON.stringify(broken), null).notice).toContain('could not be read')
  })

  it('rejects a supplier value claimed without saying where it came from', () => {
    const offer = { ...sampleWorkspace.suppliers[0].offers[0], available: { value: 30, evidence: null } }
    const broken = { ...sampleWorkspace, suppliers: [{ ...sampleWorkspace.suppliers[0], offers: [offer] }] }
    expect(readSaved(JSON.stringify(broken), null).notice).toContain('could not be read')
  })
})
