import type { Evidence, Movement, Order, OrderLine, StockRecord, Workspace } from './model.js'

export const newId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`

const pairKey = (locationId: string, productId: string) => `${locationId}|${productId}`
const productName = (workspace: Workspace, id: string) => workspace.products.find((item) => item.id === id)?.name ?? id
const locationName = (workspace: Workspace, id: string) => workspace.locations.find((item) => item.id === id)?.name ?? id
const SIGN: Record<Movement['kind'], number> = { count: 0, receipt: 1, dispatch: -1, 'transfer-out': -1, 'transfer-return': 1, 'transfer-loss': 0 }

/** Movements as they count now: a corrected movement is replaced by its latest correction, at the original time. */
const effectiveCache = new WeakMap<Movement[], Movement[]>()
export function effectiveMovements(movements: Movement[]): Movement[] {
  const cached = effectiveCache.get(movements)
  if (cached) return cached
  const latest = new Map<string, Movement>()
  for (const movement of movements) if (movement.corrects) latest.set(movement.corrects, movement)
  const result = movements
    .filter((movement) => !movement.corrects)
    .map((movement) => {
      const correction = latest.get(movement.id)
      return correction ? { ...movement, quantity: correction.quantity, evidence: correction.evidence } : movement
    })
  effectiveCache.set(movements, result)
  return result
}

/** Stock per location and product: the latest count, plus what arrived and minus what left after it. */
export function stockFrom(movements: Movement[]): StockRecord[] {
  const byPair = new Map<string, { movement: Movement; index: number }[]>()
  effectiveMovements(movements).forEach((movement, index) => {
    const key = pairKey(movement.locationId, movement.productId)
    const events = byPair.get(key)
    if (events) events.push({ movement, index })
    else byPair.set(key, [{ movement, index }])
  })
  const records: StockRecord[] = []
  for (const events of byPair.values()) {
    events.sort((first, second) => Date.parse(first.movement.at) - Date.parse(second.movement.at) || first.index - second.index)
    let value = 0
    for (const { movement } of events) value = movement.kind === 'count' ? movement.quantity : value + SIGN[movement.kind] * movement.quantity
    const { locationId, productId } = events[0].movement
    records.push({ locationId, productId, available: { value, evidence: events.at(-1)!.movement.evidence } })
  }
  return records
}

export type Result = { workspace: Workspace } | { error: string }

export function reservedStock(workspace: Workspace, locationId: string, productId: string): number {
  return workspace.shipments
    .filter((shipment) => shipment.fromLocationId === locationId && !shipment.transferBookingId && shipment.transferStatus === 'booked')
    .reduce((total, shipment) => total + sum(shipment.lines, productId), 0)
}

export function freeStock(workspace: Workspace, locationId: string, productId: string): number {
  const onHand = workspace.stock.find((item) => item.locationId === locationId && item.productId === productId)?.available.value ?? 0
  return Math.max(0, onHand - reservedStock(workspace, locationId, productId))
}

export function transferDepartedLines(workspace: Workspace, shipmentId: string): OrderLine[] {
  const movements = effectiveMovements(workspace.movements).filter((movement) => movement.kind === 'transfer-out' && (movement.bookingId === shipmentId || (!movement.bookingId && movement.shipmentId === shipmentId)))
  return productsOf(movements).map((productId) => ({ productId, quantity: sum(movements, productId) })).filter((line) => line.quantity > 0)
}

export function transferRemainingLines(workspace: Workspace, shipmentId: string): OrderLine[] {
  const shipment = workspace.shipments.find((item) => item.id === shipmentId)
  if (!shipment || shipment.transferStatus !== 'booked') return []
  return shipment.lines.filter((line) => line.quantity > 0)
}

/** True when the action with this id was already recorded, so a retry must change nothing. */
export const alreadyRecorded = (workspace: Workspace, id: string) =>
  workspace.movements.some((movement) => movement.id === id || movement.id.startsWith(`${id}:`))

/**
 * Adds movements and works stock out again. A movement whose id is already recorded is skipped,
 * so repeating the same action changes nothing. Refused if any stock would go below zero.
 */
export function record(workspace: Workspace, movements: Movement[]): Result {
  const known = new Set(workspace.movements.map((movement) => movement.id))
  const added = movements.filter((movement) => !known.has(movement.id))
  if (added.length === 0) return { workspace }
  const all = [...workspace.movements, ...added]
  const stock = stockFrom(all)
  const negative = stock.find((item) => item.available.value < 0)
  if (negative) return { error: `That would leave less than zero ${productName(workspace, negative.productId)} at ${locationName(workspace, negative.locationId)}.` }
  return { workspace: { ...workspace, movements: all, stock } }
}

const sum = (lines: OrderLine[], productId: string) => lines.filter((line) => line.productId === productId).reduce((total, line) => total + line.quantity, 0)
const productsOf = (lines: OrderLine[]) => [...new Set(lines.map((line) => line.productId))]

// One pass over the movements gives every order's sends; the planner asks for them on every run.
const sentCache = new WeakMap<Movement[], Map<string, OrderLine[]>>()
function sentByOrder(movements: Movement[]): Map<string, OrderLine[]> {
  const cached = sentCache.get(movements)
  if (cached) return cached
  const totals = new Map<string, Map<string, number>>()
  for (const movement of effectiveMovements(movements)) {
    if (movement.kind !== 'dispatch' || !movement.orderId) continue
    const order = totals.get(movement.orderId) ?? new Map<string, number>()
    order.set(movement.productId, (order.get(movement.productId) ?? 0) + movement.quantity)
    totals.set(movement.orderId, order)
  }
  const result = new Map([...totals].map(([orderId, products]) => [orderId, [...products].map(([productId, quantity]) => ({ productId, quantity })).filter((line) => line.quantity > 0)]))
  sentCache.set(movements, result)
  return result
}

/** What has left the warehouse for this order, per product. */
export function sentLines(workspace: Workspace, orderId: string): OrderLine[] {
  return sentByOrder(workspace.movements).get(orderId) ?? []
}

/** What is still to be sent, per product. A cancelled order has nothing left to send. */
export function remainingLines(workspace: Workspace, order: Order): OrderLine[] {
  if (order.status === 'cancelled') return []
  const sent = sentLines(workspace, order.id)
  return productsOf(order.lines)
    .map((productId) => ({ productId, quantity: Math.max(0, sum(order.lines, productId) - sum(sent, productId)) }))
    .filter((line) => line.quantity > 0)
}

export const hasOutstanding = (workspace: Workspace, order: Order) => remainingLines(workspace, order).length > 0

/** The orders the planner works with: only what is still to be sent. Call once per planner entry point. */
export function outstandingOrders(workspace: Workspace): Workspace {
  const orders = workspace.orders.flatMap((order) => {
    const lines = remainingLines(workspace, order)
    return lines.length ? [{ ...order, lines }] : []
  })
  return { ...workspace, orders }
}

export function countStock(workspace: Workspace, locationId: string, productId: string, quantity: number, evidence: Evidence, at: string, id = newId('CNT')): Result {
  return record(workspace, [{ id, kind: 'count', locationId, productId, quantity, at, evidence }])
}

/** Goods leave against an existing booking; this consumes the reservation and physical stock once. */
export function departTransfer(workspace: Workspace, shipmentId: string, lines: OrderLine[], at: string, id = newId('DEP')): Result {
  if (alreadyRecorded(workspace, id)) return { workspace }
  const shipment = workspace.shipments.find((item) => item.id === shipmentId && item.fromLocationId && item.transferStatus === 'booked' && !item.transferBookingId)
  if (!shipment) return { error: 'That transfer booking no longer exists.' }
  const wanted = productsOf(lines).map((productId) => ({ productId, quantity: sum(lines, productId) })).filter((line) => line.quantity > 0)
  if (!wanted.length || lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 0)) return { error: 'Enter a positive whole quantity to send.' }
  const tooMuch = wanted.find((line) => line.quantity > sum(shipment.lines, line.productId))
  if (tooMuch) return { error: `More ${productName(workspace, tooMuch.productId)} than remains booked.` }
  const short = wanted.find((line) => (workspace.stock.find((stock) => stock.locationId === shipment.fromLocationId && stock.productId === line.productId)?.available.value ?? 0) < line.quantity)
  if (short) return { error: `Not enough counted ${productName(workspace, short.productId)} at ${locationName(workspace, shipment.fromLocationId!)}.` }
  const evidence: Evidence = { kind: 'manual', source: `Departed on ${shipment.id}`, recordedAt: at }
  const childId = `${shipment.id}-D-${id.slice(-12)}`.slice(0, 64)
  if (workspace.shipments.some((item) => item.id === childId)) return { error: 'This departure was already recorded.' }
  const route = workspace.routes.find((item) => item.fromLocationId === shipment.fromLocationId && item.toLocationId === shipment.locationId)
  const hours = route?.travelHours?.value
  const arrivalAt = hours === null || hours === undefined ? shipment.confirmedArrivalAt : new Date(Date.parse(at) + hours * 3_600_000).toISOString()
  const result = record(workspace, wanted.map((line) => ({ id: `${id}:${line.productId}`, kind: 'transfer-out', locationId: shipment.fromLocationId!, productId: line.productId, quantity: line.quantity, at, evidence, shipmentId: childId, bookingId: shipmentId })))
  if ('error' in result) return result
  const remaining = productsOf(shipment.lines).map((productId) => ({ productId, quantity: Math.max(0, sum(shipment.lines, productId) - sum(wanted, productId)) })).filter((line) => line.quantity > 0)
  const booked = { ...shipment, lines: remaining, transferStatus: remaining.length ? 'booked' as const : 'cancelled' as const }
  const departed: Workspace['shipments'][number] = {
    ...shipment, id: childId, lines: wanted, transferBookingId: shipment.id, transferStatus: 'in-transit',
    originalArrivalAt: arrivalAt, confirmedArrivalAt: arrivalAt, updateSource: `Departed on ${at}`, evidence,
  }
  return { workspace: { ...result.workspace, shipments: result.workspace.shipments.map((item) => item.id === shipmentId ? booked : item).concat(departed) } }
}

/** Cancels only the unshipped part. Goods already on the road remain expected at the destination. */
export function cancelTransferBooking(workspace: Workspace, shipmentId: string): Result {
  const shipment = workspace.shipments.find((item) => item.id === shipmentId && item.fromLocationId)
  if (!shipment || shipment.transferBookingId) return { error: 'That transfer booking no longer exists.' }
  if (shipment.transferStatus === 'cancelled') return { workspace }
  if (shipment.transferStatus !== 'booked' || shipment.lines.length === 0) return { error: 'This transfer has departed; record its arrival, return or loss instead.' }
  return { workspace: { ...workspace, shipments: workspace.shipments.map((item) => item.id === shipmentId ? { ...item, lines: [], transferStatus: 'cancelled' } : item) } }
}

/** Records the fate of goods that left a transfer but will not arrive at its destination. */
export function resolveTransferFate(workspace: Workspace, shipmentId: string, outcomes: { productId: string; fate: 'returned' | 'lost' }[], at: string, id = newId('FATE')): Result {
  if (alreadyRecorded(workspace, id)) return { workspace }
  const shipment = workspace.shipments.find((item) => item.id === shipmentId && item.fromLocationId && item.transferStatus === 'unresolved')
  if (!shipment) return { error: 'That unresolved transfer no longer exists.' }
  const evidence: Evidence = { kind: 'manual', source: `Resolved transfer ${shipment.id}`, recordedAt: at }
  const movements = outcomes.map((outcome) => {
    const line = shipment.lines.find((item) => item.productId === outcome.productId)
    if (!line) return null
    return outcome.fate === 'returned'
      ? { id: `${id}:${line.productId}`, kind: 'transfer-return' as const, locationId: shipment.fromLocationId!, productId: line.productId, quantity: line.quantity, at, evidence, shipmentId, fromLocationId: shipment.locationId }
      : { id: `${id}:${line.productId}`, kind: 'transfer-loss' as const, locationId: shipment.fromLocationId!, productId: line.productId, quantity: line.quantity, at, evidence, shipmentId }
  }).filter((movement): movement is NonNullable<typeof movement> => movement !== null)
  if (movements.length !== shipment.lines.length || new Set(outcomes.map((item) => item.productId)).size !== outcomes.length) return { error: 'Choose one fate for each product in this transfer.' }
  const result = record(workspace, movements)
  if ('error' in result) return result
  return { workspace: { ...result.workspace, shipments: result.workspace.shipments.filter((item) => item.id !== shipmentId) } }
}

/**
 * Goods leave for an order. `id` identifies this one action, so sending it twice records it once.
 * Sending part of what remains needs the customer's yes to receiving it in parts.
 */
export function sendOrder(workspace: Workspace, orderId: string, lines: OrderLine[], at: string, id = newId('DSP')): Result {
  if (alreadyRecorded(workspace, id)) return { workspace }
  const order = workspace.orders.find((item) => item.id === orderId)
  if (!order) return { error: 'That order no longer exists.' }
  if (order.status === 'cancelled') return { error: 'This order is cancelled.' }
  const wanted = productsOf(lines).map((productId) => ({ productId, quantity: sum(lines, productId) })).filter((line) => line.quantity > 0)
  if (wanted.length === 0) return { error: 'Enter how much is being sent.' }
  if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity < 0)) return { error: 'Quantities must be whole numbers.' }
  const remaining = remainingLines(workspace, order)
  const tooMuch = wanted.find((line) => line.quantity > sum(remaining, line.productId))
  if (tooMuch) return { error: `That is more ${productName(workspace, tooMuch.productId)} than the order still needs (${sum(remaining, tooMuch.productId)}).` }
  const partial = remaining.some((line) => sum(wanted, line.productId) < line.quantity)
  if (partial && order.splitAllowed !== true) return { error: order.splitAllowed === false ? 'This customer wants the order in one delivery.' : 'Ask the customer whether they accept it in parts first.' }
  const stockOf = (productId: string) => workspace.stock.find((item) => item.locationId === order.locationId && item.productId === productId)?.available.value ?? 0
  const short = wanted.find((line) => stockOf(line.productId) < line.quantity)
  if (short) return { error: `Not enough counted ${productName(workspace, short.productId)} at ${locationName(workspace, order.locationId)} (${stockOf(short.productId)}). Correct the count in Inventory first.` }
  const evidence: Evidence = { kind: 'manual', source: `Sent for ${order.id}`, recordedAt: at }
  return record(workspace, wanted.map((line) => ({
    id: `${id}:${line.productId}`, kind: 'dispatch', locationId: order.locationId, productId: line.productId, quantity: line.quantity, at, evidence, orderId,
  })))
}

/**
 * Fixes the quantity of one recorded movement; nothing else changes. If a count was taken after it,
 * stock stays as counted, because the count already included what really happened.
 */
export function correctMovement(workspace: Workspace, movementId: string, quantity: number, now: string, id = newId('COR')): Result {
  if (alreadyRecorded(workspace, id)) return { workspace }
  const original = workspace.movements.find((movement) => movement.id === movementId && !movement.corrects)
  if (!original) return { error: 'That record no longer exists.' }
  if (!Number.isInteger(quantity) || quantity < 0) return { error: 'Quantities must be whole numbers.' }
  if (original.kind === 'dispatch' && original.orderId) {
    const order = workspace.orders.find((item) => item.id === original.orderId)
    const current = effectiveMovements(workspace.movements).find((movement) => movement.id === movementId)!.quantity
    const sentNow = sum(sentLines(workspace, original.orderId), original.productId)
    if (order && sentNow - current + quantity > sum(order.lines, original.productId)) return { error: 'That is more than the order asked for.' }
  }
  const evidence: Evidence = { kind: 'manual', source: `Corrected ${original.id}`, recordedAt: now }
  return record(workspace, [{ ...original, id, quantity, evidence, corrects: original.id }])
}

/** Stops what is not yet sent. What already left stays recorded; stock does not change. */
export function cancelRemaining(workspace: Workspace, orderId: string, now: string): Result {
  const order = workspace.orders.find((item) => item.id === orderId)
  if (!order) return { error: 'That order no longer exists.' }
  if (!hasOutstanding(workspace, order)) return { error: 'Nothing is left to cancel on this order.' }
  return { workspace: { ...workspace, orders: workspace.orders.map((item) => item.id === orderId ? { ...item, status: 'cancelled', closedAt: now } : item) } }
}

/** Brings back what was cancelled. Only demand comes back; stock does not. */
export function reopenOrder(workspace: Workspace, orderId: string): Result {
  const order = workspace.orders.find((item) => item.id === orderId)
  if (!order) return { error: 'That order no longer exists.' }
  if (order.status !== 'cancelled') return { workspace }
  const { closedAt: _closed, ...rest } = order
  return { workspace: { ...workspace, orders: workspace.orders.map((item) => item.id === orderId ? { ...rest, status: 'open' } : item) } }
}

export function setSplitAllowed(workspace: Workspace, orderId: string, allowed: boolean): Workspace {
  return { ...workspace, orders: workspace.orders.map((order) => order.id === orderId ? { ...order, splitAllowed: allowed } : order) }
}
