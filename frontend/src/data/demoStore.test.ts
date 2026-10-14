import { describe, expect, it } from 'vitest'
import { distributorDemo } from './distributorDemo'
import { parseSavedDemo } from './demoStore'

describe('saved demo edits', () => {
  it('restores edits that were saved in this browser', () => {
    const edited = { ...distributorDemo, inventory: { ...distributorDemo.inventory, northCases: { value: 9, evidence: { kind: 'manual' as const, source: 'Entered manually', recordedAt: '2026-10-15T09:00:00+05:30' } } } }
    expect(parseSavedDemo(JSON.stringify(edited))?.inventory.northCases.value).toBe(9)
  })

  it('ignores damaged or old-format saved data instead of showing it', () => {
    expect(parseSavedDemo('{not json')).toBeNull()
    expect(parseSavedDemo(JSON.stringify({ ...distributorDemo, version: 0 }))).toBeNull()
    // A stock count without evidence would show as fact with no source.
    expect(parseSavedDemo(JSON.stringify({ ...distributorDemo, inventory: { ...distributorDemo.inventory, northCases: { value: 9 } } }))).toBeNull()
    // A supplier value claimed without saying where it came from.
    expect(parseSavedDemo(JSON.stringify({ ...distributorDemo, suppliers: [{ ...distributorDemo.suppliers[0], availableCases: { value: 30, evidence: null } }] }))).toBeNull()
  })
})
