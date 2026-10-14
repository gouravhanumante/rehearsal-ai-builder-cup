import type { Workspace } from './model.js'

/** Hard caps so a request or saved file cannot make the planner do unbounded work. */
export const LIMITS = {
  products: 20_000, locations: 10_000, stock: 300_000, orders: 100_000, lines: 100,
  shipments: 20_000, routes: 20_000, suppliers: 2_000, offers: 20_000,
}

type Check = (value: unknown) => boolean
const isObject = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (max = 200): Check => (value) => typeof value === 'string' && value.length > 0 && value.length <= max
const isTime: Check = (value) => typeof value === 'string' && value.length <= 40 && !Number.isNaN(Date.parse(value))
const isCount: Check = (value) => Number.isInteger(value) && (value as number) >= 0 && (value as number) <= 10_000_000
const isAmount: Check = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1e12
const listOf = (check: Check, max: number): Check => (value) => Array.isArray(value) && value.length <= max && value.every(check)
const oneOf = (...options: string[]): Check => (value) => options.includes(value as string)
const shape = (fields: Record<string, Check>): Check => (value) => isObject(value) && Object.entries(fields).every(([key, check]) => check(value[key]))
const nullable = (check: Check): Check => (value) => value === null || check(value)
const optional = (check: Check): Check => (value) => value === undefined || check(value)

const isEvidence: Check = shape({ kind: oneOf('sample', 'manual', 'document', 'import'), source: isText(160), recordedAt: isTime })
const recorded = (check: Check): Check => (value) => isObject(value) && check(value.value) && isEvidence(value.evidence)
const fact = (check: Check): Check => (value) => isObject(value)
  && (value.value === null ? value.evidence === null : check(value.value) && isEvidence(value.evidence))
const isLine = shape({ productId: isText(64), quantity: isCount })

const isWorkspaceShape = shape({
  version: (value) => value === 2,
  mode: oneOf('demo', 'real'),
  businessName: isText(80),
  settings: shape({ country: isText(2), currency: isText(3), timeZone: isText(64), locale: isText(16) }),
  products: listOf(shape({ id: isText(64), name: isText(80), unit: isText(24), pack: isText(80) }), LIMITS.products),
  locations: listOf(shape({ id: isText(64), name: isText(80), kind: oneOf('warehouse', 'store', 'distribution-centre'), receivingLimitPerDay: nullable(isCount), storageLimit: optional(nullable(isCount)) }), LIMITS.locations),
  stock: listOf(shape({ locationId: isText(64), productId: isText(64), available: recorded(isCount) }), LIMITS.stock),
  storageLimits: optional(listOf(shape({ locationId: isText(64), productId: isText(64), limit: isCount }), LIMITS.stock)),
  orders: listOf(shape({
    id: isText(64), customer: isText(80), locationId: isText(64), dueAt: isTime,
    priority: oneOf('protected', 'standard'), lines: listOf(isLine, LIMITS.lines), evidence: isEvidence,
  }), LIMITS.orders),
  shipments: listOf(shape({
    id: isText(64), supplierName: isText(80), locationId: isText(64), lines: listOf(isLine, LIMITS.lines),
    originalArrivalAt: isTime, confirmedArrivalAt: isTime, updateSource: isText(80), evidence: isEvidence,
  }), LIMITS.shipments),
  disruptions: listOf(shape({ id: isText(64), kind: oneOf('shipment-delay'), shipmentId: isText(64) }), LIMITS.shipments),
  routes: listOf(shape({
    id: isText(64), fromLocationId: isText(64), toLocationId: isText(64), arrivalAt: fact(isTime),
    quotes: listOf(shape({ quantity: isCount, amount: isAmount }), 20),
  }), LIMITS.routes),
  suppliers: listOf(shape({
    id: isText(64), name: isText(80), contact: optional(nullable(isText(120))),
    offers: listOf(shape({ productId: isText(64), locationId: isText(64), available: fact(isCount), pricePerUnit: fact(isAmount), arrivalAt: fact(isTime) }), LIMITS.offers),
  }), LIMITS.suppliers),
  conflictDecisions: listOf(shape({ conflictId: isText(200), winner: oneOf('earliest-due', 'priority') }), 1000),
  approval: nullable(shape({ planId: isText(200), withWarning: (value) => typeof value === 'boolean', approvedAt: isTime, defaultedConflicts: isCount })),
})

/** Checks untrusted data (browser storage, API requests) before the planner sees it. */
export function parseWorkspace(value: unknown): Workspace | null {
  // Saves made before workspaces had a mode were all the sample.
  const candidate = isObject(value) && value.mode === undefined ? { ...value, mode: 'demo' } : value
  return isWorkspaceShape(candidate) ? candidate as Workspace : null
}
