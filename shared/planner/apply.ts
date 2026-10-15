import type { Evidence, HistoryEntry, InboundShipment, Movement, OrderLine, Workspace } from './model.js'
import type { Plan } from './plan.js'
import { alreadyRecorded, newId, record } from './ledger.js'
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
  // Ids already used by past movements stay taken, so an old record never points at a new delivery.
  const taken = new Set([...workspace.shipments.map((shipment) => shipment.id), ...workspace.movements.flatMap((movement) => movement.shipmentId ? [movement.shipmentId] : [])])
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
    const shipment = { ...delivery('TR', `Transfer from ${locationName(from)}`, 'Approved transfer', { ...evidence, source: `Booked transfer from ${locationName(from)}` }), fromLocationId: from, transferStatus: 'booked' as const }
    return { ...workspace, shipments: [...workspace.shipments, shipment] }
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
 * A delivery arrived: what came is added to that location's stock, and the delivery stops counting as
 * incoming, so it is never counted twice. A regular delivery moves on to its next date. If part is
 * missing and the rest is still coming, the rest stays incoming for the date the user gives.
 */
export function receiveDelivery(workspace: Workspace, shipmentId: string, received: OrderLine[], rest: { arrivalAt: string } | null, now: string, id = newId('RCV')): Workspace {
  const shipment = workspace.shipments.find((item) => item.id === shipmentId)
  if (!shipment || alreadyRecorded(workspace, id)) return workspace
  if (shipment.fromLocationId && shipment.transferStatus === 'booked') return workspace
  const evidence: Evidence = { kind: 'manual', source: `Received ${shipment.id}`, recordedAt: now }
  const total = (lines: OrderLine[], productId: string) => lines.filter((line) => line.productId === productId).reduce((sum, line) => sum + line.quantity, 0)
  const products = (lines: OrderLine[]) => [...new Set(lines.map((line) => line.productId))]

  const receipts: Movement[] = products(received).filter((productId) => total(received, productId) > 0).map((productId) => ({
    id: `${id}:${productId}`, kind: 'receipt', locationId: shipment.locationId, productId, quantity: total(received, productId), at: now, evidence,
    shipmentId: shipment.id, ...(shipment.fromLocationId ? { fromLocationId: shipment.fromLocationId } : {}),
  }))
  const recorded = record(workspace, receipts)
  if ('error' in recorded) return workspace

  const missing = products(shipment.lines)
    .map((productId) => ({ productId, quantity: Math.max(0, total(shipment.lines, productId) - total(received, productId)) }))
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
    const taken = new Set([...shipments.map((item) => item.id), ...recorded.workspace.movements.flatMap((movement) => movement.shipmentId ? [movement.shipmentId] : [])])
    let restId = `${shipment.id}-REST`
    for (let n = 2; taken.has(restId); n += 1) restId = `${shipment.id}-REST-${n}`
    shipments = [...shipments, {
      id: restId, supplierName: shipment.supplierName, locationId: shipment.locationId, lines: missing,
      originalArrivalAt: rest.arrivalAt, confirmedArrivalAt: rest.arrivalAt, updateSource: `Rest of ${shipment.id}`, evidence,
      ...(shipment.fromLocationId ? { fromLocationId: shipment.fromLocationId, ...(shipment.transferBookingId ? { transferBookingId: shipment.transferBookingId } : {}), transferStatus: 'in-transit' as const } : {}),
    }]
  }
  if (shipment.fromLocationId && missing.length > 0 && !rest) {
    shipments = [...others, { ...shipment, lines: missing, transferStatus: 'unresolved', updateSource: `Unresolved after receipt ${shipment.id}`, evidence }]
  }
  return { ...recorded.workspace, shipments, disruptions: workspace.disruptions.filter((item) => item.shipmentId !== shipment.id) }
}

/** Adds one line to History, keeping only the newest entries so a long-lived business stays small. */
export function addHistory(workspace: Workspace, entry: HistoryEntry): Workspace {
  const history = [...(workspace.history ?? []), entry]
  return { ...workspace, history: history.slice(-LIMITS.history) }
}
