import type { Evidence, InboundShipment, Workspace } from './model.js'
import type { Plan } from './plan.js'

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
