import type { Evidence, HistoryEntry, InboundShipment, OrderLine, Workspace } from './model.js'
import type { Plan } from './plan.js'
import { LIMITS } from './validate.js'

const DAY_MS = 86_400_000

const nextId = (prefix: string, taken: Set<string>) => {
  for (let n = 1; ; n += 1) if (!taken.has(`${prefix}-${n}`)) return `${prefix}-${n}`
}

/**
 * What approving a ready plan changes in the records, so the picture stays true afterwards:
 * a transfer takes stock out of the source now and adds an incoming delivery at the destination;
 * a purchase adds an incoming delivery from the supplier; ship-from moves the order.
 */
export function applyPlan(workspace: Workspace, plan: Plan, now: string): Workspace {
  const locationName = (id: string) => workspace.locations.find((location) => location.id === id)?.name ?? id
  const taken = new Set(workspace.shipments.map((shipment) => shipment.id))
  const delivery = (prefix: string, supplierName: string, updateSource: string, evidence: Evidence): InboundShipment => ({
    id: nextId(prefix, taken), supplierName, locationId: plan.locationId,
    lines: [{ productId: plan.productId, quantity: plan.quantity ?? 0 }],
    originalArrivalAt: plan.arrivalAt ?? now, confirmedArrivalAt: plan.arrivalAt ?? now, updateSource, evidence,
  })

  if (plan.kind === 'ship-from' && plan.orderId && plan.sourceLocationId) {
    const from = plan.sourceLocationId
    return { ...workspace, orders: workspace.orders.map((order) => order.id === plan.orderId ? { ...order, locationId: from } : order) }
  }

  if (plan.kind === 'transfer' && plan.sourceLocationId && plan.quantity && plan.arrivalAt) {
    const from = plan.sourceLocationId
    const evidence: Evidence = { kind: 'manual', source: `Approved transfer to ${locationName(plan.locationId)}`, recordedAt: now }
    return {
      ...workspace,
      stock: workspace.stock.map((record) => record.locationId === from && record.productId === plan.productId
        ? { ...record, available: { value: Math.max(0, record.available.value - plan.quantity!), evidence } }
        : record),
      shipments: [...workspace.shipments, delivery('TR', `Transfer from ${locationName(from)}`, 'Approved transfer', { ...evidence, source: `Approved transfer from ${locationName(from)}` })],
    }
  }

  if (plan.kind === 'supplier' && plan.supplierId && plan.quantity && plan.arrivalAt) {
    const supplier = workspace.suppliers.find((item) => item.id === plan.supplierId)
    if (!supplier) return workspace
    const evidence: Evidence = { kind: 'manual', source: `Approved purchase from ${supplier.name}`, recordedAt: now }
    return {
      ...workspace,
      // What they offered is now partly spoken for.
      suppliers: workspace.suppliers.map((item) => item.id !== supplier.id ? item : {
        ...item,
        offers: item.offers.map((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId && offer.available.value !== null
          ? { ...offer, available: { ...offer.available, value: Math.max(0, offer.available.value - plan.quantity!) } }
          : offer),
      }),
      shipments: [...workspace.shipments, delivery('PO', supplier.name, 'Approved purchase', evidence)],
    }
  }

  return workspace
}

/**
 * Delivered: the goods left the warehouse, so its stock goes down by the order. Cancelled: nothing
 * left, stock stays. Reopening undoes it (a delivered order's goods are counted back in).
 */
export function setOrderStatus(workspace: Workspace, orderId: string, status: 'open' | 'delivered' | 'cancelled', now: string): Workspace {
  const order = workspace.orders.find((item) => item.id === orderId)
  if (!order || (order.status ?? 'open') === status) return workspace
  const wasDelivered = order.status === 'delivered'
  const sign = status === 'delivered' ? -1 : wasDelivered ? 1 : 0
  const evidence: Evidence = { kind: 'manual', source: `${status === 'delivered' ? 'Delivered' : 'Reopened'} ${order.id}`, recordedAt: now }
  const stock = sign === 0 ? workspace.stock : workspace.stock.map((record) => {
    if (record.locationId !== order.locationId) return record
    const moved = order.lines.filter((line) => line.productId === record.productId).reduce((total, line) => total + line.quantity, 0)
    return moved === 0 ? record : { ...record, available: { value: Math.max(0, record.available.value + sign * moved), evidence } }
  })
  const { closedAt: _previous, ...rest } = order
  const next = status === 'open' ? { ...rest, status } : { ...rest, status, closedAt: now }
  return { ...workspace, stock, orders: workspace.orders.map((item) => item.id === orderId ? next : item) }
}

/**
 * A delivery arrived: what came is added to that location's stock, and the delivery stops counting as
 * incoming, so it is never counted twice. A regular delivery moves on to its next date. If part is
 * missing and the rest is still coming, the rest stays incoming for the date the user gives.
 */
export function receiveDelivery(workspace: Workspace, shipmentId: string, received: OrderLine[], rest: { arrivalAt: string } | null, now: string): Workspace {
  const shipment = workspace.shipments.find((item) => item.id === shipmentId)
  if (!shipment) return workspace
  const evidence: Evidence = { kind: 'manual', source: `Received ${shipment.id}`, recordedAt: now }
  const arrived = (productId: string) => received.filter((line) => line.productId === productId).reduce((total, line) => total + line.quantity, 0)

  let stock = workspace.stock.map((record) => {
    const quantity = record.locationId === shipment.locationId ? arrived(record.productId) : 0
    return quantity === 0 ? record : { ...record, available: { value: record.available.value + quantity, evidence } }
  })
  for (const productId of new Set(received.map((line) => line.productId))) {
    const counted = stock.some((record) => record.locationId === shipment.locationId && record.productId === productId)
    if (!counted && arrived(productId) > 0) stock = [...stock, { locationId: shipment.locationId, productId, available: { value: arrived(productId), evidence } }]
  }

  const missing = shipment.lines
    .map((line) => ({ productId: line.productId, quantity: Math.max(0, line.quantity - arrived(line.productId)) }))
    .filter((line) => line.quantity > 0)

  const others = workspace.shipments.filter((item) => item.id !== shipment.id)
  let shipments: InboundShipment[] = others
  if (shipment.repeatEveryDays) {
    // The schedule carries on from its original date; the next one is the first scheduled date after this arrival.
    const start = Date.parse(shipment.originalArrivalAt)
    const step = shipment.repeatEveryDays * DAY_MS
    const after = Math.max(Date.parse(shipment.confirmedArrivalAt), start)
    const nextAt = new Date(start + (Math.floor((after - start) / step) + 1) * step).toISOString()
    shipments = [...others, { ...shipment, confirmedArrivalAt: nextAt, updateSource: 'Regular delivery', evidence }]
  }
  if (rest && missing.length > 0) {
    const taken = new Set(shipments.map((item) => item.id))
    let id = `${shipment.id}-REST`
    for (let n = 2; taken.has(id); n += 1) id = `${shipment.id}-REST-${n}`
    shipments = [...shipments, {
      id, supplierName: shipment.supplierName, locationId: shipment.locationId, lines: missing,
      originalArrivalAt: rest.arrivalAt, confirmedArrivalAt: rest.arrivalAt, updateSource: `Rest of ${shipment.id}`, evidence,
    }]
  }

  return { ...workspace, stock, shipments, disruptions: workspace.disruptions.filter((item) => item.shipmentId !== shipment.id) }
}

/** Adds one line to History, keeping only the newest entries so a long-lived business stays small. */
export function addHistory(workspace: Workspace, entry: HistoryEntry): Workspace {
  const history = [...(workspace.history ?? []), entry]
  return { ...workspace, history: history.slice(-LIMITS.history) }
}
