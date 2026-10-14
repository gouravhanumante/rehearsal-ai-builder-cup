/** Where a value came from. Unknown values have no evidence at all. */
export type EvidenceKind = 'sample' | 'manual' | 'document'
export type Evidence = { kind: EvidenceKind; source: string; recordedAt: string }

/** A value we hold, with where it came from. */
export type Recorded<T> = { value: T; evidence: Evidence }
/** A value that may still be unknown. Unknown is never treated as zero. */
export type Fact<T> = { value: T | null; evidence: Evidence | null }

export type WorkspaceSettings = { country: string; currency: string; timeZone: string; locale: string }

export type Product = { id: string; name: string; unit: string; pack: string }

export type LocationKind = 'warehouse' | 'store' | 'distribution-centre'
export type Location = { id: string; name: string; kind: LocationKind; receivingLimitPerDay: number | null }

export type StockRecord = { locationId: string; productId: string; available: Recorded<number> }

export type OrderLine = { productId: string; quantity: number }
export type Order = {
  id: string
  customer: string
  locationId: string
  dueAt: string
  priority: 'protected' | 'standard'
  lines: OrderLine[]
  evidence: Evidence
}

export type InboundShipment = {
  id: string
  supplierName: string
  locationId: string
  lines: OrderLine[]
  originalArrivalAt: string
  confirmedArrivalAt: string
  updateSource: string
  evidence: Evidence
}

export type Disruption = { id: string; kind: 'shipment-delay'; shipmentId: string }

/** Moving stock between two locations. Cost is known only for quantities someone quoted. */
export type TransferRoute = {
  id: string
  fromLocationId: string
  toLocationId: string
  arrivalAt: Fact<string>
  quotes: { quantity: number; amount: number }[]
}

export type SupplierOffer = {
  productId: string
  locationId: string
  available: Fact<number>
  pricePerUnit: Fact<number>
  arrivalAt: Fact<string>
}
export type Supplier = { id: string; name: string; offers: SupplierOffer[] }

/** The user's answer to "who gets the stock" when a priority order competes with an earlier one. */
export type ConflictDecision = { conflictId: string; winner: 'earliest-due' | 'priority' }

export type Approval = { planId: string; withWarning: boolean; approvedAt: string; defaultedConflicts: number }

export type Workspace = {
  version: 2
  businessName: string
  settings: WorkspaceSettings
  products: Product[]
  locations: Location[]
  stock: StockRecord[]
  orders: Order[]
  shipments: InboundShipment[]
  disruptions: Disruption[]
  routes: TransferRoute[]
  suppliers: Supplier[]
  conflictDecisions: ConflictDecision[]
  approval: Approval | null
}

export type Money = { amount: number; currency: string }
