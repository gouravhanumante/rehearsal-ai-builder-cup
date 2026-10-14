import { describe, expect, it } from 'vitest'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { sampleWorkspace } from '../../../shared/planner/sample'
import { setupProgress } from './setup'

describe('setup progress', () => {
  it('starts with locations, and says nothing has been added', () => {
    const progress = setupProgress(createBlankWorkspace('Priya Traders', 'IN'))
    expect(progress).toMatchObject({ isEmpty: true, requiredDone: 0, requiredTotal: 5, canReportDelay: false })
    expect(progress.next?.id).toBe('locations')
  })

  it('moves on to the next missing step as things are added', () => {
    const withPlaces = { ...createBlankWorkspace('Priya Traders', 'IN'), locations: sampleWorkspace.locations, products: sampleWorkspace.products }
    expect(setupProgress(withPlaces).next?.id).toBe('stock')
  })

  it('never makes backup sources a requirement', () => {
    const progress = setupProgress(createBlankWorkspace('Priya Traders', 'IN'))
    expect(progress.steps.find((step) => step.id === 'sources')?.optional).toBe(true)
    expect(setupProgress(sampleWorkspace).next).toBeNull()
  })

  it('can report a delay only once there is a shipment to delay', () => {
    expect(setupProgress(sampleWorkspace).canReportDelay).toBe(true)
    expect(setupProgress({ ...sampleWorkspace, shipments: [] }).canReportDelay).toBe(false)
  })
})
