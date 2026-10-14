/** Where a value came from. Unknown values have no evidence at all. */
export type EvidenceKind = 'sample' | 'manual' | 'document'
export type Evidence = { kind: EvidenceKind; source: string; recordedAt: string }

/** A value we hold, with where it came from. */
export type Recorded<T> = { value: T; evidence: Evidence }
/** A value that may still be unknown. Unknown is never treated as zero. */
export type Fact<T> = { value: T | null; evidence: Evidence | null }

export type DemoOrder = {
  id: string
  customer: string
  productId: string
  dueAt: string
  cases: number
  priority: 'protected' | 'standard'
  evidence: Evidence
}

export type AlternativeSupplier = {
  id: string
  name: string
  availableCases: Fact<number>
  pricePerCase: Fact<number>
  arrivalAt: Fact<string>
}

export type DistributorData = {
  version: 1
  businessName: string
  product: { id: string; name: string; pack: string }
  warehouses: {
    north: { id: string; name: string; receivingLimitPerDay: number }
    south: { id: string; name: string }
  }
  inventory: { northCases: Recorded<number>; southUnallocatedCases: Recorded<number> }
  transfer: { confirmed: boolean; expectedArrivalAt: string }
  shipment: {
    id: string
    supplier: string
    cases: number
    originalArrivalAt: string
    confirmedArrivalAt: string
    updateSource: string
    updateConfirmed: boolean
    updatedAt: string
  }
  orders: DemoOrder[]
  suppliers: AlternativeSupplier[]
  sampleTransferCosts: { eightCases: number; fourteenCases: number }
}

export const sampleEvidence: Evidence = { kind: 'sample', source: 'Sample data', recordedAt: '2026-10-15T08:42:00+05:30' }
const unknown = { value: null, evidence: null }

export const distributorDemo: DistributorData = {
  version: 1,
  businessName: 'Northstar Supply',
  product: { id: 'harbor-blend', name: 'Harbor Blend Coffee', pack: '1 kg case' },
  warehouses: {
    north: { id: 'north', name: 'North Hub', receivingLimitPerDay: 8 },
    south: { id: 'south', name: 'South Hub' },
  },
  inventory: {
    northCases: { value: 14, evidence: sampleEvidence },
    southUnallocatedCases: { value: 14, evidence: sampleEvidence },
  },
  transfer: {
    confirmed: true,
    expectedArrivalAt: '2026-10-15T12:00:00+05:30',
  },
  shipment: {
    id: 'SH-204',
    supplier: 'Meridian Foods',
    cases: 24,
    originalArrivalAt: '2026-10-13T09:00:00+05:30',
    confirmedArrivalAt: '2026-10-16T15:00:00+05:30',
    updateSource: 'Supplier update',
    updateConfirmed: true,
    updatedAt: '08:42',
  },
  orders: [
    { id: 'ORD-1082', customer: 'Common Ground Cafe', productId: 'harbor-blend', dueAt: '2026-10-15T14:00:00+05:30', cases: 18, priority: 'protected', evidence: sampleEvidence },
    { id: 'ORD-1086', customer: 'Harbor Market', productId: 'harbor-blend', dueAt: '2026-10-16T12:00:00+05:30', cases: 12, priority: 'standard', evidence: sampleEvidence },
    { id: 'ORD-1091', customer: 'Daily Goods Co.', productId: 'harbor-blend', dueAt: '2026-10-16T12:00:00+05:30', cases: 8, priority: 'standard', evidence: sampleEvidence },
    { id: 'ORD-1104', customer: 'Lakeview Grocers', productId: 'harbor-blend', dueAt: '2026-10-19T10:00:00+05:30', cases: 10, priority: 'standard', evidence: sampleEvidence },
  ],
  suppliers: [
    { id: 'supplier-b', name: 'Supplier B', availableCases: unknown, pricePerCase: unknown, arrivalAt: unknown },
  ],
  sampleTransferCosts: { eightCases: 95, fourteenCases: 165 },
}

export const MAX_ALTERNATIVE_SUPPLIERS = 5
