import { describe, expect, it } from 'vitest'
import { sampleWorkspace } from '../../../shared/planner/sample'
import { readSaved } from './demoStore'

describe('saved demo edits', () => {
  it('restores edits saved in this browser', () => {
    const edited = { ...sampleWorkspace, businessName: 'Edited Supply' }
    expect(readSaved(JSON.stringify(edited))).toEqual({ workspace: edited, notice: null })
  })

  it('never drops damaged saved data silently: it loads the sample and says so', () => {
    const result = readSaved('{not json')
    expect(result.workspace).toBe(sampleWorkspace)
    expect(result.notice).toContain('could not be read')
  })

  it('rejects a stock count with no record of where it came from', () => {
    const broken = { ...sampleWorkspace, movements: [{ ...sampleWorkspace.movements[0], evidence: undefined }] }
    expect(readSaved(JSON.stringify(broken)).notice).toContain('could not be read')
  })

  it('rejects a supplier value claimed without saying where it came from', () => {
    const offer = { ...sampleWorkspace.suppliers[0].offers[0], available: { value: 30, evidence: null } }
    const broken = { ...sampleWorkspace, suppliers: [{ ...sampleWorkspace.suppliers[0], offers: [offer] }] }
    expect(readSaved(JSON.stringify(broken)).notice).toContain('could not be read')
  })
})
