import { describe, expect, it } from 'vitest'
import { distributorDemo } from '../data/distributorDemo'
import { distributorImpact, distributorRecoveryPlans } from './rehearseDistributor'
import { rehearseDistributor } from './rehearseDistributor'

const plan = (id: string) => distributorRecoveryPlans.find((item) => item.id === id)

describe('distributor recovery rules', () => {
  it('counts only commitments due before the confirmed inbound shipment', () => {
    expect(distributorImpact.affectedOrderCount).toBe(3)
    expect(distributorImpact.casesExposed).toBe(24)
    expect(distributorImpact.northAllocations.map((allocation) => allocation.availableCases)).toEqual([14, 0, 0])
  })

  it('allows a transfer within receiving capacity and calculates remaining exposure', () => {
    expect(plan('transfer')).toMatchObject({
      status: 'ready',
      impact: 'Protects the priority order; 16 cases remain exposed',
    })
  })

  it('rejects a transfer that exceeds the daily receiving limit', () => {
    expect(plan('bulk-transfer')).toMatchObject({
      status: 'rejected',
      detail: expect.stringContaining('exceeds capacity by 6 cases'),
    })
  })

  it('rejects a capacity-valid transfer that arrives after the priority promise', () => {
    const result = rehearseDistributor({
      ...distributorDemo,
      transfer: { ...distributorDemo.transfer, expectedArrivalAt: '2026-10-16T15:00:00+05:30' },
    })
    expect(result.plans.find((item) => item.id === 'transfer')).toMatchObject({
      status: 'rejected',
      detail: 'The confirmed transfer arrival is after the priority order promise.',
    })
  })

  it('keeps an alternative supplier conditional until its availability and price are confirmed', () => {
    expect(plan('expedite')).toMatchObject({ status: 'conditional' })
  })

  it('does not treat a generic confirmation flag as proof of stock, price, and arrival', () => {
    const result = rehearseDistributor({
      ...distributorDemo,
      alternativeSupplier: { ...distributorDemo.alternativeSupplier, confirmed: true },
    })
    expect(result.plans.find((item) => item.id === 'expedite')).toMatchObject({ status: 'conditional' })
  })
})
