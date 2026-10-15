/** Where a value came from. Unknown values have no evidence at all. */
export type EvidenceKind = 'sample' | 'manual' | 'document' | 'import'
export type Evidence = { kind: EvidenceKind; source: string; recordedAt: string }

/** A value we hold, with where it came from. */
export type Recorded<T> = { value: T; evidence: Evidence }
/** A value that may still be unknown. Unknown is never treated as zero. */
export type Fact<T> = { value: T | null; evidence: Evidence | null }

export type WorkspaceSettings = { country: string; currency: string; timeZone: string; locale: string }

/** perPackage: how many items one package holds. pricePerUnit: what one package sells for, to tell whether a fix is worth its cost. Both optional for older saves. */
export type Product = { id: string; name: string; unit: string; pack: string; perPackage?: number; pricePerUnit?: number | null }

export type LocationKind = 'warehouse' | 'store' | 'distribution-centre'
/** deliveryCostPerOrder: what it costs to send one customer order out of this location. area: city or region, shown to help the user answer questions; never used to decide anything. */
export type Location = { id: string; name: string; kind: LocationKind; receivingLimitPerDay: number | null; deliveryCostPerOrder?: number | null; area?: string | null }

export type StockRecord = { locationId: string; productId: string; available: Recorded<number> }
/** Most of one product this location can hold. */
export type StorageLimit = { locationId: string; productId: string; limit: number }

export type OrderLine = { productId: string; quantity: number }
export type Order = {
  id: string
  customer: string
  locationId: string
  dueAt: string
  priority: 'protected' | 'standard'
  lines: OrderLine[]
  evidence: Evidence
  /** Delivered or cancelled orders no longer need stock. Missing means open (older saves). */
  status?: 'open' | 'delivered' | 'cancelled'
  closedAt?: string
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
  /** Repeats every N days from originalArrivalAt; confirmedArrivalAt is only the next delivery. */
  repeatEveryDays?: number
}

export type Disruption = { id: string; kind: 'shipment-delay'; shipmentId: string }

/** Moving stock between two locations. Cost is known only for quantities someone quoted. */
export type TransferRoute = {
  id: string
  fromLocationId: string
  toLocationId: string
  /** Older saves: a fixed arrival time. Used only when travelHours is not set. */
  arrivalAt: Fact<string>
  /** How long a transfer takes from booking to arrival, so the arrival never goes stale. */
  travelHours?: Fact<number>
  /** Cost of one transfer = costPerTrip + costPerUnit × quantity. A quote for the exact quantity wins. */
  costPerTrip?: number | null
  costPerUnit?: number | null
  quotes: { quantity: number; amount: number }[]
}

export type SupplierOffer = {
  productId: string
  locationId: string
  available: Fact<number>
  pricePerUnit: Fact<number>
  arrivalAt: Fact<string>
  /** Flat delivery charge on top of the price per unit, from their reply. */
  deliveryCharge?: Fact<number>
}
export type Supplier = { id: string; name: string; contact?: string | null; offers: SupplierOffer[] }

/** The user's answer to "who gets the stock" when a priority order competes with an earlier one. */
export type ConflictDecision = { conflictId: string; winner: 'earliest-due' | 'priority' }

export type Approval = { planId: string; withWarning: boolean; approvedAt: string; defaultedConflicts: number }

export type HistoryKind = 'delay' | 'approval' | 'received' | 'order' | 'edit' | 'import'
export type HistoryMessage = { to: string; email: string | null; subject: string; body: string }
/** One line in the business's History. Read-only; written when a change is saved. */
export type HistoryEntry = { at: string; kind: HistoryKind; text: string; messages?: HistoryMessage[] }

export type Workspace = {
  version: 2
  /** The sample is a shared demo; a real workspace belongs to one business. */
  mode: 'demo' | 'real'
  businessName: string
  settings: WorkspaceSettings
  products: Product[]
  locations: Location[]
  stock: StockRecord[]
  storageLimits?: StorageLimit[]
  orders: Order[]
  shipments: InboundShipment[]
  disruptions: Disruption[]
  routes: TransferRoute[]
  /** Location pairs the user said stock can't move between, so Rehearsal stops asking. */
  noTransfers?: { fromLocationId: string; toLocationId: string }[]
  /** The user's answer to "can this location deliver to that location's customers?". Unanswered pairs are asked, never guessed. */
  deliveryAnswers?: { fromLocationId: string; forLocationId: string; canDeliver: boolean }[]
  suppliers: Supplier[]
  conflictDecisions: ConflictDecision[]
  approval: Approval | null
  /** Oldest first. Missing in saves made before History existed. */
  history?: HistoryEntry[]
}

export type Money = { amount: number; currency: string }
