import type { Evidence, Goal, InboundShipment, Money, Order, TransferRoute, Workspace } from './model.js'
import { SAMPLE_NOW } from './sample.js'

export type PlanStatus = 'ready' | 'conditional' | 'rejected'

/** A typed-in value a plan depends on, and the record to open to verify it. */
export type UnverifiedFact =
  | { type: 'stock'; locationId: string; productId: string; quantity: number }
  | { type: 'order'; orderId: string }
  | { type: 'route'; routeId: string; arrivalAt: string }
  | { type: 'offer'; supplierId: string; productId: string; locationId: string; field: 'available' | 'pricePerUnit' | 'arrivalAt'; value: number | string }

export type PlanReason =
  | { code: 'transfer-ok'; quantity: number; limit: number | null }
  | { code: 'transfer-none-available' }
  | { code: 'transfer-arrival-unknown' }
  | { code: 'transfer-late' }
  | { code: 'transfer-over-limit'; limit: number; excess: number }
  | { code: 'supplier-missing'; missing: ('available' | 'pricePerUnit' | 'arrivalAt')[] }
  | { code: 'supplier-no-stock' }
  | { code: 'supplier-too-late' }
  | { code: 'supplier-ok'; exposedBefore: number; exposedAfter: number; protectsPriority: boolean }
  | { code: 'no-space'; limit: number }
  | { code: 'ship-from-ok' }
  | { code: 'ship-from-short' }
  | { code: 'ship-from-ask' }

export type Plan = {
  id: string
  kind: 'transfer' | 'bulk-transfer' | 'supplier' | 'ship-from'
  disruptionId: string
  productId: string
  locationId: string
  sourceLocationId?: string
  routeId?: string
  supplierId?: string
  /** ship-from: the order that would be sent from sourceLocationId instead. */
  orderId?: string
  status: PlanStatus
  reason: PlanReason
  quantity: number | null
  arrivalAt: string | null
  cost: Money | null
  /** What is left after this plan; null when the plan cannot be checked. */
  outcome: { exposedQuantity: number; protectsPriority: boolean } | null
  unverified: UnverifiedFact[]
  /** How much more of the product fits in storage at the destination; null when there is no limit. */
  spaceLeft: number | null
  /** What to ask a supplier for: the shortage, capped by storage space, needed by the first short order. */
  request?: { quantity: number; neededBy: string }
  /** Ready plans: how much of the shortage this plan covers. */
  savedQuantity?: number
  /** Transfers with a known travel time: book by then to arrive before the first short order. */
  bookBy?: string
  /** Supplier cost is goods only: they haven't said what delivery costs. */
  costExcludesDelivery?: boolean
}

export type Allocation = { orderId: string; ordered: number; covered: number }

/** A priority order is short because earlier standard orders were served first. */
export type Conflict = {
  id: string
  productId: string
  locationId: string
  priorityOrderId: string
  earlierOrderIds: string[]
  quantity: number
  winner: 'earliest-due' | 'priority'
  decided: boolean
}

export type ImpactGroup = {
  /** A reported delay, or orders short with nothing late (stock plus deliveries don't cover them). */
  kind: 'delay' | 'shortage'
  disruptionId: string
  shipmentId: string | null
  locationId: string
  productId: string
  delayedUntil: string | null
  exposedQuantity: number
  /** False when this location never had a count for the product; it is treated as 0. */
  counted: boolean
  /** Orders this problem leaves short. Orders covered by stock already on hand are not at risk. */
  affectedOrderIds: string[]
  /** Covered, but only by stock still on its way: they become short if that delivery slips. */
  watchOrderIds: string[]
  allocations: Allocation[]
}

type Batch = { at: string | null; quantity: number }
type Demand = { order: Order; quantity: number }

const time = (iso: string | null) => (iso === null ? Number.NEGATIVE_INFINITY : Date.parse(iso))
const isManual = (evidence: Evidence | null) => evidence?.kind === 'manual'
const lineQuantity = (record: { lines: { productId: string; quantity: number }[] }, productId: string) =>
  record.lines.filter((line) => line.productId === productId).reduce((total, line) => total + line.quantity, 0)

const byDueThenPriority = (first: Demand, second: Demand) =>
  time(first.order.dueAt) - time(second.order.dueAt)
  || Number(second.order.priority === 'protected') - Number(first.order.priority === 'protected')
  || first.order.id.localeCompare(second.order.id)

/**
 * Hands out stock batches to orders. A batch counts for an order only if it arrives by that
 * order's due time. `firstServed` orders are served before everyone else, taking the latest
 * batches they can use so earlier stock stays free for earlier orders.
 */
function allocate(demands: Demand[], batches: Batch[], firstServed: Set<string>): Allocation[] {
  const remaining = batches.map((batch) => ({ ...batch })).sort((first, second) => time(first.at) - time(second.at))
  const covered = new Map<string, number>()
  const take = (demand: Demand, latestFirst: boolean) => {
    let needed = demand.quantity
    const usable = remaining.filter((batch) => time(batch.at) <= time(demand.order.dueAt))
    for (const batch of latestFirst ? usable.reverse() : usable) {
      const used = Math.min(needed, batch.quantity)
      batch.quantity -= used
      needed -= used
      if (needed === 0) break
    }
    covered.set(demand.order.id, demand.quantity - needed)
  }
  const sorted = [...demands].sort(byDueThenPriority)
  sorted.filter((demand) => firstServed.has(demand.order.id)).forEach((demand) => take(demand, true))
  sorted.filter((demand) => !firstServed.has(demand.order.id)).forEach((demand) => take(demand, false))
  return sorted.map((demand) => ({ orderId: demand.order.id, ordered: demand.quantity, covered: covered.get(demand.order.id) ?? 0 }))
}

const shortfall = (allocations: Allocation[]) => allocations.reduce((total, item) => total + item.ordered - item.covered, 0)

const DAY_MS = 86_400_000
/** Every arrival up to `until`: the next delivery, then, if it repeats, each date on the original schedule. */
export function arrivalsOf(shipment: InboundShipment, until: number): string[] {
  const dates = [shipment.confirmedArrivalAt]
  if (!shipment.repeatEveryDays) return dates
  const start = Date.parse(shipment.originalArrivalAt)
  for (let step = 1; step <= 520; step += 1) {
    const at = start + step * shipment.repeatEveryDays * DAY_MS
    if (at > until) break
    dates.push(new Date(at).toISOString())
  }
  return dates
}

/** Most of a product this location can hold. Null means no limit for this product-location pair. */
export function storageCap(workspace: Workspace, locationId: string, productId: string): number | null {
  const own = workspace.storageLimits?.find((item) => item.locationId === locationId && item.productId === productId)
  return own?.limit ?? null
}

/**
 * A priority order left short because earlier standard orders were served first. The user's answer
 * (default: the order due first) decides who is served first, everywhere stock is shared out.
 */
function priorityConflicts(demands: Demand[], batches: Batch[], decisions: Map<string, 'earliest-due' | 'priority'>, locationId: string, productId: string) {
  const defaultAllocation = allocate(demands, batches, new Set())
  const prioritiesFirst = new Set<string>()
  const conflicts: Conflict[] = []
  for (const demand of demands.filter((item) => item.order.priority === 'protected')) {
    const own = defaultAllocation.find((item) => item.orderId === demand.order.id)
    const short = own ? own.ordered - own.covered : 0
    const earlier = demands.filter((item) => item.order.priority === 'standard' && time(item.order.dueAt) < time(demand.order.dueAt))
    const takenByEarlier = earlier.reduce((total, item) => total + (defaultAllocation.find((a) => a.orderId === item.order.id)?.covered ?? 0), 0)
    if (short <= 0 || takenByEarlier <= 0) continue
    const id = `conflict:${demand.order.id}:${productId}`
    const winner = decisions.get(id) ?? 'earliest-due'
    if (winner === 'priority') prioritiesFirst.add(demand.order.id)
    conflicts.push({ id, productId, locationId, priorityOrderId: demand.order.id, earlierOrderIds: earlier.map((item) => item.order.id), quantity: Math.min(short, takenByEarlier), winner, decided: decisions.has(id) })
  }
  return { conflicts, prioritiesFirst }
}

export type OrderCoverage = {
  orderId: string
  productId: string
  locationId: string
  ordered: number
  covered: number
  /** Arriving at this warehouse by the order's due time, from incoming shipments (before other orders take any). */
  arriving: number
  status: 'covered' | 'short'
  /** False when this warehouse never had a count for the product: it is treated as 0 (user decision 2026-10-15). */
  counted: boolean
}

/**
 * Every order line against its own warehouse, delay or not: stock on hand plus shipments that
 * arrive by the due time, shared with other orders due first. No stock count means unknown.
 */
export const isOpen = (order: Order) => (order.status ?? 'open') === 'open'
/** The planner only works with open orders; delivered and cancelled ones need no stock. */
const openOnly = (workspace: Workspace): Workspace =>
  workspace.orders.every(isOpen) ? workspace : { ...workspace, orders: workspace.orders.filter(isOpen) }

export function orderCoverage(input: Workspace, onlyLocationId?: string): OrderCoverage[] {
  const workspace = openOnly(input)
  const decisions = new Map(workspace.conflictDecisions.map((decision) => [decision.conflictId, decision.winner]))
  const result: OrderCoverage[] = []
  const pairs = new Set(workspace.orders
    .filter((order) => onlyLocationId === undefined || order.locationId === onlyLocationId)
    .flatMap((order) => order.lines.map((line) => `${order.locationId}|${line.productId}`)))
  for (const pair of pairs) {
    const [locationId, productId] = pair.split('|')
    const stock = workspace.stock.find((record) => record.locationId === locationId && record.productId === productId)
    const demands: Demand[] = workspace.orders
      .filter((order) => order.locationId === locationId)
      .map((order) => ({ order, quantity: lineQuantity(order, productId) }))
      .filter((demand) => demand.quantity > 0)
    const horizon = Math.max(...demands.map((demand) => time(demand.order.dueAt)))
    const inbound: Batch[] = workspace.shipments
      .filter((shipment) => shipment.locationId === locationId && lineQuantity(shipment, productId) > 0)
      .flatMap((shipment) => arrivalsOf(shipment, horizon).map((at) => ({ at, quantity: lineQuantity(shipment, productId) })))
    const allocations = allocate(demands, [{ at: null, quantity: stock?.available.value ?? 0 }, ...inbound], priorityConflicts(demands, [{ at: null, quantity: stock?.available.value ?? 0 }, ...inbound], decisions, locationId, productId).prioritiesFirst)
    for (const allocation of allocations) {
      const dueAt = demands.find((demand) => demand.order.id === allocation.orderId)?.order.dueAt ?? null
      const arriving = inbound.filter((batch) => time(batch.at) <= time(dueAt)).reduce((total, batch) => total + batch.quantity, 0)
      result.push({
        orderId: allocation.orderId, productId, locationId, ordered: allocation.ordered, covered: allocation.covered, arriving,
        status: allocation.covered < allocation.ordered ? 'short' : 'covered',
        counted: Boolean(stock),
      })
    }
  }
  return result
}

/**
 * How much of a product a location can give away today and still cover every one of its own
 * orders as well as it does now (stock on hand plus deliveries arriving by each due time).
 */
export function spareStock(input: Workspace, locationId: string, productId: string): number {
  const workspace = openOnly(input)
  const onHand = workspace.stock.find((record) => record.locationId === locationId && record.productId === productId)?.available.value ?? 0
  const demands: Demand[] = workspace.orders
    .filter((order) => order.locationId === locationId)
    .map((order) => ({ order, quantity: lineQuantity(order, productId) }))
    .filter((demand) => demand.quantity > 0)
  if (demands.length === 0) return onHand
  const horizon = Math.max(...demands.map((demand) => time(demand.order.dueAt)))
  const inbound: Batch[] = workspace.shipments
    .filter((shipment) => shipment.locationId === locationId && lineQuantity(shipment, productId) > 0)
    .flatMap((shipment) => arrivalsOf(shipment, horizon).map((at) => ({ at, quantity: lineQuantity(shipment, productId) })))
  const coveredWith = (stock: number) => allocate(demands, [{ at: null, quantity: stock }, ...inbound], new Set())
    .reduce((total, item) => total + item.covered, 0)
  const full = coveredWith(onHand)
  let low = 0
  let high = onHand
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (coveredWith(onHand - mid) === full) low = mid
    else high = mid - 1
  }
  return low
}

/** The moment a transfer would be booked: the sample's fixed morning, or the real clock. */
export const planningNow = (workspace: Workspace) => (workspace.mode === 'demo' ? SAMPLE_NOW : new Date().toISOString())

/** When stock moved along this route would arrive if booked at `now`, and where that number came from. */
export function routeArrival(route: TransferRoute, now: string): { at: string | null; evidence: Evidence | null } {
  if (route.travelHours) {
    const hours = route.travelHours.value
    return hours === null ? { at: null, evidence: null } : { at: new Date(Date.parse(now) + hours * 3_600_000).toISOString(), evidence: route.travelHours.evidence }
  }
  return { at: route.arrivalAt.value, evidence: route.arrivalAt.evidence }
}

export function rehearse(input: Workspace, now: string = planningNow(input)) {
  const workspace = openOnly(input)
  const { settings } = workspace
  const stockKey = (locationId: string, productId: string) => `${locationId}|${productId}`
  const stockByKey = new Map(workspace.stock.map((record) => [stockKey(record.locationId, record.productId), record]))
  const shipmentById = new Map(workspace.shipments.map((shipment) => [shipment.id, shipment]))
  const locationById = new Map(workspace.locations.map((location) => [location.id, location]))
  const decisions = new Map(workspace.conflictDecisions.map((decision) => [decision.conflictId, decision.winner]))

  const groups: ImpactGroup[] = []
  const conflicts: Conflict[] = []
  const plans: Plan[] = []
  const affected = new Set<string>()
  const watched = new Set<string>()
  const problems: { kind: ImpactGroup['kind']; disruptionId: string; shipmentId: string | null; locationId: string; productId: string; delayedUntil: string | null; demands: Demand[]; inbound: Batch[] }[] = []

  for (const disruption of workspace.disruptions) {
    const shipment = shipmentById.get(disruption.shipmentId)
    if (!shipment) continue
    for (const productId of new Set(shipment.lines.map((line) => line.productId))) {
      const locationId = shipment.locationId
      const delayedUntil = shipment.confirmedArrivalAt
      const demands: Demand[] = workspace.orders
        .filter((order) => order.locationId === locationId && time(order.dueAt) < time(delayedUntil))
        .map((order) => ({ order, quantity: lineQuantity(order, productId) }))
        .filter((demand) => demand.quantity > 0)
      // The delayed delivery itself is excluded; later deliveries of a repeating schedule still count.
      const inbound: Batch[] = workspace.shipments
        .filter((other) => other.locationId === locationId && lineQuantity(other, productId) > 0)
        .flatMap((other) => {
          const dates = arrivalsOf(other, time(delayedUntil))
          return (other.id === shipment.id ? dates.slice(1) : dates).map((at) => ({ at, quantity: lineQuantity(other, productId) }))
        })
        .filter((batch) => time(batch.at) < time(delayedUntil))
      problems.push({ kind: 'delay', disruptionId: disruption.id, shipmentId: shipment.id, locationId, productId, delayedUntil, demands, inbound })
    }
  }

  // Orders short with nothing late: same options, for warehouses not already in a reported delay.
  const inDelay = new Set(problems.map((problem) => stockKey(problem.locationId, problem.productId)))
  const shortPairs = new Set(orderCoverage(workspace)
    .filter((line) => line.status === 'short' && !inDelay.has(stockKey(line.locationId, line.productId)))
    .map((line) => stockKey(line.locationId, line.productId)))
  for (const pair of shortPairs) {
    const [locationId, productId] = pair.split('|')
    const demands: Demand[] = workspace.orders
      .filter((order) => order.locationId === locationId)
      .map((order) => ({ order, quantity: lineQuantity(order, productId) }))
      .filter((demand) => demand.quantity > 0)
    const horizon = Math.max(...demands.map((demand) => time(demand.order.dueAt)))
    const inbound: Batch[] = workspace.shipments
      .filter((shipment) => shipment.locationId === locationId && lineQuantity(shipment, productId) > 0)
      .flatMap((shipment) => arrivalsOf(shipment, horizon).map((at) => ({ at, quantity: lineQuantity(shipment, productId) })))
    problems.push({ kind: 'shortage', disruptionId: `short:${locationId}:${productId}`, shipmentId: null, locationId, productId, delayedUntil: null, demands, inbound })
  }

  for (const problem of problems) {
    {
      const { locationId, productId, demands, delayedUntil } = problem
      const stock = stockByKey.get(stockKey(locationId, productId))
      const onHand: Batch[] = [{ at: null, quantity: stock?.available.value ?? 0 }, ...problem.inbound]

      const found = priorityConflicts(demands, onHand, decisions, locationId, productId)
      const { prioritiesFirst } = found
      conflicts.push(...found.conflicts)

      const outcome = (extra: Batch[], withoutOrderId?: string) => {
        const kept = demands.filter((item) => item.order.id !== withoutOrderId)
        const allocations = allocate(kept, [...onHand, ...extra], prioritiesFirst)
        const priorityIds = new Set(kept.filter((item) => item.order.priority === 'protected').map((item) => item.order.id))
        return {
          allocations,
          exposedQuantity: shortfall(allocations),
          protectsPriority: allocations.filter((item) => priorityIds.has(item.orderId)).every((item) => item.covered === item.ordered),
        }
      }
      const baseline = outcome([])
      const shortIds = baseline.allocations.filter((item) => item.covered < item.ordered).map((item) => item.orderId)
      const fromStockOnly = allocate(demands, onHand.slice(0, 1), prioritiesFirst)
      const watchIds = baseline.allocations
        .filter((item) => item.covered >= item.ordered && (fromStockOnly.find((own) => own.orderId === item.orderId)?.covered ?? 0) < item.ordered)
        .map((item) => item.orderId)
      shortIds.forEach((id) => affected.add(id))
      watchIds.forEach((id) => watched.add(id))
      groups.push({
        kind: problem.kind, disruptionId: problem.disruptionId, shipmentId: problem.shipmentId, locationId, productId, delayedUntil,
        affectedOrderIds: shortIds,
        watchOrderIds: watchIds,
        exposedQuantity: baseline.exposedQuantity,
        allocations: baseline.allocations,
        counted: Boolean(stock),
      })
      if (baseline.exposedQuantity === 0) continue

      const onHandCount = stock?.available.value ?? 0
      const baseUnverified: UnverifiedFact[] = [
        ...(stock && isManual(stock.available.evidence) ? [{ type: 'stock' as const, locationId, productId, quantity: stock.available.value }] : []),
        ...demands.filter((item) => isManual(item.order.evidence)).map((item) => ({ type: 'order' as const, orderId: item.order.id })),
      ]
      const earliestPriorityDue = Math.min(...demands.filter((item) => item.order.priority === 'protected').map((item) => time(item.order.dueAt)))
      const destinationLimit = locationById.get(locationId)?.receivingLimitPerDay ?? null
      // Room is measured against today's count; stock leaving for orders before arrival is not credited.
      const cap = storageCap(workspace, locationId, productId)
      const spaceLeft = cap === null ? null : Math.max(0, cap - onHandCount)
      const common = { disruptionId: problem.disruptionId, productId, locationId, spaceLeft }
      const fits = (quantity: number) => (spaceLeft === null ? quantity : Math.min(quantity, spaceLeft))
      const firstShort = baseline.allocations.find((item) => item.covered < item.ordered)
      const neededBy = demands.find((item) => item.order.id === firstShort?.orderId)?.order.dueAt ?? delayedUntil ?? demands[0].order.dueAt

      for (const route of workspace.routes.filter((item) => item.toLocationId === locationId)) {
        const source = stockByKey.get(stockKey(route.fromLocationId, productId))
        if (!source) continue
        const sourceQuantity = source.available.value
        const spare = spareStock(workspace, route.fromLocationId, productId)
        // Move only what is short, from what the source can spare, within receiving and storage limits.
        const quantity = fits(Math.min(spare, baseline.exposedQuantity, destinationLimit ?? spare))
        const costFor = (amount: number): Money | null => {
          const quote = route.quotes.find((item) => item.quantity === amount)
          if (quote) return { amount: quote.amount, currency: settings.currency }
          const trip = route.costPerTrip ?? null
          const perUnit = route.costPerUnit ?? null
          if (trip === null && perUnit === null) return null
          return { amount: Math.round(((trip ?? 0) + (perUnit ?? 0) * amount) * 100) / 100, currency: settings.currency }
        }
        const arrival = routeArrival(route, now)
        const unverified: UnverifiedFact[] = [
          ...baseUnverified,
          ...(isManual(source.available.evidence) ? [{ type: 'stock' as const, locationId: route.fromLocationId, productId, quantity: sourceQuantity }] : []),
          ...(arrival.at !== null && isManual(arrival.evidence) ? [{ type: 'route' as const, routeId: route.id, arrivalAt: arrival.at }] : []),
        ]
        const arrivalAt = arrival.at
        const base = { ...common, sourceLocationId: route.fromLocationId, routeId: route.id, arrivalAt, unverified }

        if (cap !== null && spaceLeft === 0) {
          plans.push({ ...base, id: `transfer:${route.id}:${productId}`, kind: 'transfer', status: 'rejected', reason: { code: 'no-space', limit: cap }, quantity: 0, cost: null, outcome: null, unverified: [] })
        } else if (quantity <= 0) {
          plans.push({ ...base, id: `transfer:${route.id}:${productId}`, kind: 'transfer', status: 'rejected', reason: { code: 'transfer-none-available' }, quantity: 0, cost: null, outcome: null, unverified: [] })
        } else if (arrivalAt === null) {
          plans.push({ ...base, id: `transfer:${route.id}:${productId}`, kind: 'transfer', status: 'conditional', reason: { code: 'transfer-arrival-unknown' }, quantity, cost: costFor(quantity), outcome: null, unverified: [] })
        } else {
          const result = outcome([{ at: arrivalAt, quantity }])
          const late = time(arrivalAt) > earliestPriorityDue || result.exposedQuantity >= baseline.exposedQuantity
          const hours = route.travelHours?.value ?? null
          const deadline = Math.min(time(neededBy), earliestPriorityDue)
          plans.push({
            ...base, id: `transfer:${route.id}:${productId}`, kind: 'transfer',
            status: late ? 'rejected' : 'ready',
            reason: late ? { code: 'transfer-late' } : { code: 'transfer-ok', quantity, limit: destinationLimit },
            quantity, cost: costFor(quantity),
            outcome: late ? null : { exposedQuantity: result.exposedQuantity, protectsPriority: result.protectsPriority },
            unverified: late ? [] : unverified,
            ...(late ? {} : { savedQuantity: baseline.exposedQuantity - result.exposedQuantity }),
            ...(!late && hours !== null && Number.isFinite(deadline) ? { bookBy: new Date(deadline - hours * 3_600_000).toISOString() } : {}),
          })
        }
        // Only worth showing when moving all that is needed would break the receiving limit.
        const wanted = Math.min(spare, baseline.exposedQuantity)
        if (destinationLimit !== null && wanted > destinationLimit) {
          plans.push({
            ...base, id: `bulk:${route.id}:${productId}`, kind: 'bulk-transfer', status: 'rejected',
            reason: { code: 'transfer-over-limit', limit: destinationLimit, excess: wanted - destinationLimit },
            quantity: wanted, cost: costFor(wanted), outcome: null, unverified: [],
          })
        }
      }

      for (const supplier of workspace.suppliers) {
        for (const offer of supplier.offers.filter((item) => item.productId === productId && item.locationId === locationId)) {
          const id = `supplier:${supplier.id}:${productId}:${locationId}`
          const request = { quantity: fits(baseline.exposedQuantity), neededBy }
          const base = { ...common, id, kind: 'supplier' as const, supplierId: supplier.id, request }
          const available = offer.available.value
          const price = offer.pricePerUnit.value
          const arrivalAt = offer.arrivalAt.value
          if (cap !== null && spaceLeft === 0) {
            plans.push({ ...base, status: 'rejected', reason: { code: 'no-space', limit: cap }, quantity: 0, arrivalAt, cost: null, outcome: null, unverified: [] })
            continue
          }
          if (available === null || price === null || arrivalAt === null) {
            const missing = (['available', 'pricePerUnit', 'arrivalAt'] as const).filter((field) => offer[field].value === null)
            plans.push({ ...base, status: 'conditional', reason: { code: 'supplier-missing', missing: [...missing] }, quantity: null, arrivalAt, cost: null, outcome: null, unverified: [] })
            continue
          }
          const quantity = Math.min(available, request.quantity)
          const result = outcome([{ at: arrivalAt, quantity }])
          const helps = quantity > 0 && result.exposedQuantity < baseline.exposedQuantity
          const offerUnverified: UnverifiedFact[] = (['available', 'pricePerUnit', 'arrivalAt'] as const)
            .filter((field) => isManual(offer[field].evidence))
            .map((field) => ({ type: 'offer', supplierId: supplier.id, productId, locationId, field, value: offer[field].value as number | string }))
          plans.push({
            ...base,
            status: helps ? 'ready' : 'rejected',
            reason: helps
              ? { code: 'supplier-ok', exposedBefore: baseline.exposedQuantity, exposedAfter: result.exposedQuantity, protectsPriority: result.protectsPriority }
              : available <= 0 ? { code: 'supplier-no-stock' } : { code: 'supplier-too-late' },
            quantity, arrivalAt,
            cost: { amount: Math.round((quantity * price + (offer.deliveryCharge?.value ?? 0)) * 100) / 100, currency: settings.currency },
            ...(offer.deliveryCharge?.value == null ? { costExcludesDelivery: true } : {}),
            outcome: helps ? { exposedQuantity: result.exposedQuantity, protectsPriority: result.protectsPriority } : null,
            unverified: helps ? [...baseUnverified, ...offerUnverified] : [],
            ...(helps ? { savedQuantity: baseline.exposedQuantity - result.exposedQuantity } : {}),
          })
        }
      }

      // Send a short order from another location instead, if it covers the whole order and still covers its own orders.
      const sources = workspace.stock.filter((record) => record.productId === productId && record.locationId !== locationId && record.available.value > 0)
      for (const short of baseline.allocations.filter((item) => item.covered < item.ordered)) {
        const order = demands.find((item) => item.order.id === short.orderId)?.order
        if (!order) continue
        for (const source of sources) {
          const from = source.locationId
          // Only the user knows whether this place can reach that place's customers: No hides it, no answer asks.
          const answer = workspace.deliveryAnswers?.find((item) => item.fromLocationId === from && item.forLocationId === locationId)
          if (answer && !answer.canDeliver) continue
          const moved = { ...workspace, orders: workspace.orders.map((item) => item.id === order.id ? { ...item, locationId: from } : item) }
          const before = new Map(orderCoverage(workspace, from).map((line) => [`${line.orderId}|${line.productId}`, line.status]))
          const covers = orderCoverage(moved, from).every((line) => line.orderId === order.id
            ? line.status === 'covered'
            : line.status === 'covered' || line.status === before.get(`${line.orderId}|${line.productId}`))
          const ready = covers && answer?.canDeliver === true
          const result = ready ? outcome([], order.id) : null
          // The extra cost of delivering this order from the other location instead of its own.
          const fromCost = locationById.get(from)?.deliveryCostPerOrder ?? null
          const ownCost = locationById.get(locationId)?.deliveryCostPerOrder ?? null
          const extra = fromCost === null || ownCost === null ? null : { amount: Math.max(0, fromCost - ownCost), currency: settings.currency }
          plans.push({
            ...common, id: `ship:${order.id}:${from}:${productId}`, kind: 'ship-from', orderId: order.id, sourceLocationId: from,
            status: !covers ? 'rejected' : ready ? 'ready' : 'conditional',
            reason: { code: !covers ? 'ship-from-short' : ready ? 'ship-from-ok' : 'ship-from-ask' },
            quantity: short.ordered, arrivalAt: null, cost: extra,
            outcome: result && { exposedQuantity: result.exposedQuantity, protectsPriority: result.protectsPriority },
            ...(result ? { savedQuantity: baseline.exposedQuantity - result.exposedQuantity } : {}),
            unverified: ready
              ? [...baseUnverified, ...(isManual(source.available.evidence) ? [{ type: 'stock' as const, locationId: from, productId, quantity: source.available.value }] : [])]
              : [],
          })
        }
      }
    }
  }

  const kindOrder = { transfer: 0, 'ship-from': 1, supplier: 2, 'bulk-transfer': 3 }
  plans.sort((first, second) => kindOrder[first.kind] - kindOrder[second.kind])
  return {
    impact: {
      groups,
      affectedOrderIds: [...affected],
      watchOrderIds: [...watched].filter((id) => !affected.has(id)),
      unaffectedOrderIds: workspace.orders.filter((order) => !affected.has(order.id) && !watched.has(order.id)).map((order) => order.id),
      exposedQuantity: groups.reduce((total, group) => total + group.exposedQuantity, 0),
      uncountedGroups: groups.filter((group) => !group.counted).length,
    },
    conflicts,
    plans,
  }
}

export type Rehearsal = ReturnType<typeof rehearse>

/**
 * The best ready plan for the business's goal (see rankPlans). Protect deliveries, the default: priority
 * orders covered, then least left short, then cheaper, then fewer typed-in details.
 */
export function recommendPlan(plans: Plan[], goal: Goal = 'protect') {
  return rankPlans(plans, goal).find((plan) => plan.status === 'ready' && plan.outcome)
}

const statusOrder: Record<PlanStatus, number> = { ready: 0, conditional: 1, rejected: 2 }
/**
 * Best first: ready plans by the goal, then ones waiting for information, then ones that can't be done.
 * Lowest cost: cheapest total first (unknown cost last). Balanced: priority orders covered, then the
 * lowest cost per package it saves. Ties fall back to the protect-deliveries order.
 */
export function rankPlans(plans: Plan[], goal: Goal = 'protect') {
  const costOf = (plan: Plan) => plan.cost?.amount ?? Number.MAX_SAFE_INTEGER
  const perPackage = (plan: Plan) => (plan.cost && plan.savedQuantity ? plan.cost.amount / plan.savedQuantity : Number.MAX_SAFE_INTEGER)
  const priority = (first: Plan, second: Plan) => Number(second.outcome?.protectsPriority) - Number(first.outcome?.protectsPriority)
  const exposure = (first: Plan, second: Plan) => (first.outcome?.exposedQuantity ?? 0) - (second.outcome?.exposedQuantity ?? 0)
  const protect = (first: Plan, second: Plan) => priority(first, second) || exposure(first, second) || costOf(first) - costOf(second) || first.unverified.length - second.unverified.length
  const byGoal = goal === 'cost'
    ? (first: Plan, second: Plan) => costOf(first) - costOf(second) || protect(first, second)
    : goal === 'balanced'
      ? (first: Plan, second: Plan) => priority(first, second) || perPackage(first) - perPackage(second) || protect(first, second)
      : protect
  return [...plans].sort((first, second) => statusOrder[first.status] - statusOrder[second.status]
    || (first.status === 'ready' ? byGoal(first, second) : 0))
}

/** A plan whose status is ready but relies on typed-in details. */
export const isUnverified = (plan: Plan) => plan.status === 'ready' && plan.unverified.length > 0
