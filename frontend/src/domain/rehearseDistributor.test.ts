import { describe, expect, it } from 'vitest'
import { distributorDemo, type AlternativeSupplier, type DistributorData, type Evidence } from '../data/distributorDemo'
import { recommendPlan, rehearseDistributor } from './rehearseDistributor'

const typed: Evidence = { kind: 'manual', source: 'Entered manually', recordedAt: '2026-10-15T09:00:00+05:30' }
const quote: Evidence = { kind: 'document', source: 'supplier-b-quote.pdf', recordedAt: '2026-10-15T09:00:00+05:30' }

function withSupplierB(details: { cases: number | null; price: number | null; arrival: string | null; evidence: Evidence }): DistributorData {
  const fact = <T,>(value: T | null) => ({ value, evidence: value === null ? null : details.evidence })
  const supplier: AlternativeSupplier = {
    id: 'supplier-b', name: 'Supplier B',
    availableCases: fact(details.cases), pricePerCase: fact(details.price), arrivalAt: fact(details.arrival),
  }
  return { ...distributorDemo, suppliers: [supplier] }
}

const planIn = (data: DistributorData, id: string) => rehearseDistributor(data).plans.find((plan) => plan.id === id)
const thursdayMorning = '2026-10-15T10:00:00+05:30'

describe('which orders the delay affects', () => {
  it('counts only orders due before the delayed shipment arrives', () => {
    const { impact } = rehearseDistributor(distributorDemo)
    expect(impact.affectedOrderCount).toBe(3)
    expect(impact.casesExposed).toBe(24)
    expect(impact.northAllocations.map((allocation) => allocation.availableCases)).toEqual([14, 0, 0])
  })

  it('lists an order due after the shipment arrives as unaffected, not at risk', () => {
    const { impact } = rehearseDistributor(distributorDemo)
    expect(impact.unaffectedOrderIds).toEqual(['ORD-1104'])
    expect(impact.northAllocations.map((allocation) => allocation.orderId)).not.toContain('ORD-1104')
  })
})

describe('warehouse transfer options', () => {
  it('allows a transfer within receiving capacity and calculates remaining exposure', () => {
    expect(planIn(distributorDemo, 'transfer')).toMatchObject({
      status: 'ready',
      statusLabel: 'Ready to use',
      impact: 'Protects the priority order; 16 cases remain exposed',
    })
  })

  it('rejects a transfer that exceeds the daily receiving limit', () => {
    expect(planIn(distributorDemo, 'bulk-transfer')).toMatchObject({
      status: 'rejected',
      detail: expect.stringContaining('exceeds capacity by 6 cases'),
    })
  })

  it('does not reuse the 8-case transfer price when a different number of cases is moved', () => {
    const data = { ...distributorDemo, inventory: { ...distributorDemo.inventory, southUnallocatedCases: { value: 5, evidence: typed } } }
    expect(planIn(data, 'transfer')?.cost).toBe('Transfer cost not quoted for 5 cases')
    expect(planIn(distributorDemo, 'transfer')?.cost).toBe('Estimated: $95 transfer cost')
  })

  it('does not offer moving "everything" as a separate option when everything already fits', () => {
    const data = { ...distributorDemo, inventory: { ...distributorDemo.inventory, southUnallocatedCases: { value: 6, evidence: typed } } }
    expect(planIn(data, 'bulk-transfer')).toBeUndefined()
  })

  it('rejects a capacity-valid transfer that arrives after the priority promise', () => {
    const data = { ...distributorDemo, transfer: { ...distributorDemo.transfer, expectedArrivalAt: '2026-10-16T15:00:00+05:30' } }
    expect(planIn(data, 'transfer')).toMatchObject({
      status: 'rejected',
      detail: 'The confirmed transfer arrival is after the priority order promise.',
    })
  })

  it('flags the transfer as unverified when a stock count it relies on was typed in', () => {
    const data = { ...distributorDemo, inventory: { ...distributorDemo.inventory, southUnallocatedCases: { value: 14, evidence: typed } } }
    const transfer = planIn(data, 'transfer')
    expect(transfer).toMatchObject({ status: 'ready', statusLabel: 'Ready · unverified' })
    expect(transfer?.unverifiedFacts.map((fact) => fact.label)).toEqual(['South Hub stock'])
  })
})

describe('backup supplier options', () => {
  it('stays "Needs information" while any of stock, price, or arrival is unknown, and says which', () => {
    const data = withSupplierB({ cases: 20, price: 11, arrival: null, evidence: quote })
    expect(planIn(data, 'supplier-supplier-b')).toMatchObject({
      status: 'conditional',
      statusLabel: 'Needs information',
      detail: expect.stringContaining('arrival time'),
    })
  })

  it('is usable with typed-in details, but marked unverified so approval warns first', () => {
    const plan = planIn(withSupplierB({ cases: 20, price: 11, arrival: thursdayMorning, evidence: typed }), 'supplier-supplier-b')
    expect(plan).toMatchObject({ status: 'ready', statusLabel: 'Ready · unverified' })
    expect(plan?.unverifiedFacts).toHaveLength(3)
  })

  it('is ready with no warning when the same details come from a document', () => {
    const plan = planIn(withSupplierB({ cases: 20, price: 11, arrival: thursdayMorning, evidence: quote }), 'supplier-supplier-b')
    expect(plan).toMatchObject({ status: 'ready', statusLabel: 'Ready to use', unverifiedFacts: [] })
  })

  it('buys only what is short and prices it per case', () => {
    const plan = planIn(withSupplierB({ cases: 40, price: 11, arrival: thursdayMorning, evidence: quote }), 'supplier-supplier-b')
    expect(plan?.cost).toBe('Estimated: $264 (24 × $11)')
    expect(plan?.impact).toBe('Protects the priority order; 0 cases remain exposed')
  })

  it('does not protect the priority order with stock that lands after that order is due', () => {
    // Priority order is due Thu 2:00 PM. Stock arriving Fri 10:00 AM can only help the Friday orders.
    const plan = planIn(withSupplierB({ cases: 20, price: 11, arrival: '2026-10-16T10:00:00+05:30', evidence: quote }), 'supplier-supplier-b')
    expect(plan).toMatchObject({ status: 'ready', impact: 'Priority order remains exposed; 4 cases remain exposed' })
  })

  it("can't be done when the stock arrives after every affected order is due", () => {
    const plan = planIn(withSupplierB({ cases: 20, price: 11, arrival: '2026-10-16T13:00:00+05:30', evidence: quote }), 'supplier-supplier-b')
    expect(plan).toMatchObject({ status: 'rejected', statusLabel: "Can't be done" })
  })
})

describe('overview recommendation', () => {
  it('prefers the plan that protects the priority order with the fewest cases left exposed', () => {
    const data = withSupplierB({ cases: 20, price: 11, arrival: thursdayMorning, evidence: quote })
    expect(recommendPlan(rehearseDistributor(data).plans)?.id).toBe('supplier-supplier-b')
    expect(recommendPlan(rehearseDistributor(distributorDemo).plans)?.id).toBe('transfer')
  })

  it('recommends nothing when no option is ready', () => {
    const data = { ...distributorDemo, inventory: { ...distributorDemo.inventory, southUnallocatedCases: { value: 0, evidence: typed } } }
    expect(recommendPlan(rehearseDistributor(data).plans)).toBeUndefined()
  })
})
