import type { Workspace } from '../../../shared/planner/model'
import type { Conflict, Plan, UnverifiedFact } from '../../../shared/planner/plan'
import type { Format } from './format'

export type EditTarget =
  | { type: 'stock'; locationId: string; productId: string }
  | { type: 'order'; orderId: string }
  | { type: 'offer'; supplierId: string; offerIndex: number }
  | { type: 'route'; routeId: string }
  | { type: 'location'; locationId: string }
  | { type: 'product'; productId: string }
  | { type: 'new-supplier' }
  | { type: 'new-location' }
  | { type: 'new-product' }

const fieldLabels = { available: 'Stock available', pricePerUnit: 'Price per unit', arrivalAt: 'Arrival time' } as const
const missingLabels = { available: 'stock available', pricePerUnit: 'price per unit', arrivalAt: 'arrival time' } as const

/** Turns planner results (numbers and codes) into the words shown on screen. */
export function createWording(workspace: Workspace, format: Format) {
  const productById = new Map(workspace.products.map((product) => [product.id, product]))
  const locationName = (id: string) => workspace.locations.find((location) => location.id === id)?.name ?? 'Unknown location'
  const productName = (id: string) => productById.get(id)?.name ?? 'Unknown product'
  const supplierName = (id: string | undefined) => workspace.suppliers.find((supplier) => supplier.id === id)?.name ?? 'Supplier'
  const orderById = new Map(workspace.orders.map((order) => [order.id, order]))
  const customer = (orderId: string) => orderById.get(orderId)?.customer ?? orderId
  const manyProducts = workspace.products.length > 1

  const quantity = (value: number, productId: string) => {
    const unit = productById.get(productId)?.unit ?? 'unit'
    return `${format.number(value)} ${value === 1 ? unit : `${unit}s`}`
  }
  /** A total across products: in the product's unit when there is only one. */
  const totalUnit = (value: number) => {
    const unit = manyProducts || !workspace.products[0] ? 'unit' : workspace.products[0].unit
    return value === 1 ? unit : `${unit}s`
  }
  const totalQuantity = (value: number) => `${format.number(value)} ${totalUnit(value)}`

  const statusLabel = (plan: Plan) =>
    plan.status === 'ready' ? (plan.unverified.length ? 'Ready · unverified' : 'Ready to use') : plan.status === 'conditional' ? 'Needs information' : "Can't be done"

  const impactOf = (plan: Plan) => {
    if (plan.outcome) {
      return `${plan.outcome.protectsPriority ? 'Protects the priority order' : 'Priority order remains exposed'}; ${quantity(plan.outcome.exposedQuantity, plan.productId)} remain exposed`
    }
    if (plan.kind === 'bulk-transfer') return 'Would cover more near-term demand if receiving capacity allowed'
    if (plan.status === 'conditional') return 'Cannot be checked yet'
    return 'Does not reduce the shortage'
  }

  const costOf = (plan: Plan) => {
    if (plan.kind === 'supplier') {
      if (!plan.cost || plan.quantity === null) return 'Price unknown'
      const offer = workspace.suppliers.find((item) => item.id === plan.supplierId)?.offers.find((item) => item.productId === plan.productId && item.locationId === plan.locationId)
      const unitPrice = offer?.pricePerUnit.value
      return `Estimated: ${format.money(plan.cost.amount)}${unitPrice !== null && unitPrice !== undefined ? ` (${format.number(plan.quantity)} × ${format.money(unitPrice)})` : ''}`
    }
    if (plan.cost) return `Estimated: ${format.money(plan.cost.amount)} transfer cost`
    return `Transfer cost not quoted for ${quantity(plan.quantity ?? 0, plan.productId)}`
  }

  const detailOf = (plan: Plan) => {
    const { reason } = plan
    const destination = locationName(plan.locationId)
    switch (reason.code) {
      case 'transfer-ok':
        return reason.limit === null
          ? `${quantity(reason.quantity, plan.productId)} arrive before the priority order is due.`
          : `${quantity(reason.quantity, plan.productId)} fit within ${destination}’s receiving limit of ${quantity(reason.limit, plan.productId)} per day and arrive before the priority order is due.`
      case 'transfer-none-available': return `${locationName(plan.sourceLocationId ?? '')} has no unallocated stock to move.`
      case 'transfer-arrival-unknown': return 'Transfer arrival time is not confirmed, so this option cannot yet be checked against the order promise.'
      case 'transfer-late': return 'The confirmed transfer arrival is after the priority order promise.'
      case 'transfer-over-limit': return `${destination} can receive at most ${quantity(reason.limit, plan.productId)} per day. This transfer exceeds capacity by ${quantity(reason.excess, plan.productId)}.`
      case 'supplier-missing': return `Missing: ${reason.missing.map((field) => missingLabels[field]).join(', ')}. Add these to check whether this option works.`
      case 'supplier-no-stock': return `${supplierName(plan.supplierId)} has no stock to offer.`
      case 'supplier-too-late': return 'Arrives after every affected order is due, so it does not help.'
      case 'supplier-ok': return `Arrives before ${reason.protectsPriority ? 'the priority order is due' : 'some affected orders are due'} and cuts the shortage from ${quantity(reason.exposedBefore, plan.productId)} to ${quantity(reason.exposedAfter, plan.productId)}.`
    }
  }

  const titleOf = (plan: Plan) => {
    const suffix = manyProducts ? ` · ${productName(plan.productId)}` : ''
    if (plan.kind === 'transfer') return `Transfer stock from ${locationName(plan.sourceLocationId ?? '')}${suffix}`
    if (plan.kind === 'bulk-transfer') return `Transfer all ${quantity(plan.quantity ?? 0, plan.productId)} in one day${suffix}`
    return `Buy emergency stock from ${supplierName(plan.supplierId)}${suffix}`
  }

  const descriptionOf = (plan: Plan) => {
    const destination = locationName(plan.locationId)
    if (plan.kind === 'transfer') return `Move ${quantity(plan.quantity ?? 0, plan.productId)} to ${destination} before the priority order is due.`
    if (plan.kind === 'bulk-transfer') return `Move the full available ${locationName(plan.sourceLocationId ?? '')} balance to ${destination}.`
    if (plan.quantity === null || plan.arrivalAt === null) return `Ask ${supplierName(plan.supplierId)} for stock that arrives before the delayed shipment.`
    return `Buy ${quantity(plan.quantity, plan.productId)} from ${supplierName(plan.supplierId)}, arriving ${format.dateTime(plan.arrivalAt)}.`
  }

  const planText = (plan: Plan) => ({
    title: titleOf(plan),
    description: descriptionOf(plan),
    detail: detailOf(plan),
    impact: impactOf(plan),
    cost: costOf(plan),
    statusLabel: statusLabel(plan),
  })

  const offerTarget = (fact: Extract<UnverifiedFact, { type: 'offer' }>): EditTarget => {
    const supplier = workspace.suppliers.find((item) => item.id === fact.supplierId)
    const offerIndex = supplier?.offers.findIndex((offer) => offer.productId === fact.productId && offer.locationId === fact.locationId) ?? 0
    return { type: 'offer', supplierId: fact.supplierId, offerIndex: Math.max(0, offerIndex) }
  }

  const unverifiedText = (fact: UnverifiedFact): { label: string; value: string; target: EditTarget } => {
    if (fact.type === 'stock') {
      return { label: `${locationName(fact.locationId)} stock`, value: quantity(fact.quantity, fact.productId), target: { type: 'stock', locationId: fact.locationId, productId: fact.productId } }
    }
    if (fact.type === 'order') {
      const order = orderById.get(fact.orderId)
      const firstLine = order?.lines[0]
      return {
        label: `${customer(fact.orderId)} order`,
        value: order && firstLine ? `${quantity(firstLine.quantity, firstLine.productId)} due ${format.dateTime(order.dueAt)}` : fact.orderId,
        target: { type: 'order', orderId: fact.orderId },
      }
    }
    if (fact.type === 'route') {
      const route = workspace.routes.find((item) => item.id === fact.routeId)
      return {
        label: `Transfer ${locationName(route?.fromLocationId ?? '')} → ${locationName(route?.toLocationId ?? '')} arrival`,
        value: format.dateTime(fact.arrivalAt),
        target: { type: 'route', routeId: fact.routeId },
      }
    }
    const value = fact.field === 'arrivalAt' ? format.dateTime(String(fact.value))
      : fact.field === 'pricePerUnit' ? format.money(Number(fact.value)) : quantity(Number(fact.value), fact.productId)
    return { label: `${supplierName(fact.supplierId)} · ${fieldLabels[fact.field]}`, value, target: offerTarget(fact) }
  }

  const conflictText = (conflict: Conflict) => ({
    question: `Who gets the ${quantity(conflict.quantity, conflict.productId)}?`,
    priority: `${customer(conflict.priorityOrderId)} (priority, due ${format.dateTime(orderById.get(conflict.priorityOrderId)?.dueAt ?? '')})`,
    earlier: conflict.earlierOrderIds.map((id) => `${customer(id)} (due ${format.dateTime(orderById.get(id)?.dueAt ?? '')})`).join(', '),
  })

  return { locationName, productName, supplierName, customer, quantity, totalUnit, totalQuantity, planText, unverifiedText, conflictText }
}

export type Wording = ReturnType<typeof createWording>
