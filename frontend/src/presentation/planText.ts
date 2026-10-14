import type { TransferRoute, Workspace } from '../../../shared/planner/model'
import { planningNow, routeArrival, type Conflict, type OrderCoverage, type Plan, type UnverifiedFact } from '../../../shared/planner/plan'
import { pluralUnit, type Format } from './format'

export type EditTarget =
  | { type: 'stock'; locationId: string; productId: string }
  | { type: 'order'; orderId: string }
  | { type: 'offer'; supplierId: string; offerIndex: number }
  | { type: 'route'; routeId: string }
  | { type: 'location'; locationId: string }
  | { type: 'product'; productId: string }
  | { type: 'new-supplier'; productId?: string; locationId?: string }
  | { type: 'supplier'; supplierId: string; addProductId?: string }
  | { type: 'new-location' }
  | { type: 'new-product' }
  | { type: 'new-order' }
  | { type: 'new-shipment'; productId?: string; locationId?: string }
  | { type: 'new-route'; fromLocationId?: string; toLocationId?: string }
  | { type: 'report-delay'; shipmentId?: string }

const fieldLabels = { available: 'Stock available', pricePerUnit: 'Price per unit', arrivalAt: 'Arrival time' } as const
const missingLabels = { available: 'stock available', pricePerUnit: 'price per unit', arrivalAt: 'arrival time' } as const

/** Turns planner results (numbers and codes) into the words shown on screen. */
export function createWording(workspace: Workspace, format: Format) {
  const productById = new Map(workspace.products.map((product) => [product.id, product]))
  const locationName = (id: string) => workspace.locations.find((location) => location.id === id)?.name ?? 'Unknown location'
  /** "Warehouse B (Delhi)" when an area is set: helps the user answer where-can-it-deliver questions. */
  const placeName = (id: string) => {
    const location = workspace.locations.find((item) => item.id === id)
    return location?.area ? `${location.name} (${location.area})` : locationName(id)
  }
  const productName = (id: string) => productById.get(id)?.name ?? 'Unknown product'
  const supplierName = (id: string | undefined) => workspace.suppliers.find((supplier) => supplier.id === id)?.name ?? 'Supplier'
  const orderById = new Map(workspace.orders.map((order) => [order.id, order]))
  const customer = (orderId: string) => orderById.get(orderId)?.customer ?? orderId
  const manyProducts = workspace.products.length > 1

  const quantity = (value: number, productId: string) => {
    const unit = productById.get(productId)?.unit ?? 'unit'
    return `${format.number(value)} ${pluralUnit(unit, value)}`
  }
  /** A total across products: in the product's unit when there is only one. */
  const totalUnit = (value: number) => {
    const unit = manyProducts || !workspace.products[0] ? 'unit' : workspace.products[0].unit
    return pluralUnit(unit, value)
  }
  const totalQuantity = (value: number) => `${format.number(value)} ${totalUnit(value)}`

  /** "the priority order" only when one is waiting on this product here; otherwise "the first short order". */
  const dueWhat = (plan: Plan) => workspace.orders.some((order) => order.locationId === plan.locationId && order.priority === 'protected' && order.lines.some((line) => line.productId === plan.productId))
    ? 'the priority order' : 'the first short order'

  const statusLabel = (plan: Plan) =>
    plan.status === 'ready' ? (plan.unverified.length ? 'Ready · unverified' : 'Ready to use')
      : plan.reason.code === 'supplier-missing' ? 'Waiting for reply'
      : plan.reason.code === 'ship-from-ask' ? 'Needs your answer'
      : plan.status === 'conditional' ? 'Needs information' : "Can't be done"

  const impactOf = (plan: Plan) => {
    if (plan.outcome) {
      const left = plan.outcome.exposedQuantity
      const hasPriority = workspace.orders.some((order) => order.locationId === plan.locationId && order.priority === 'protected' && order.lines.some((line) => line.productId === plan.productId))
      if (left === 0) return 'Covers every order'
      if (!hasPriority) return `${quantity(left, plan.productId)} still short`
      return plan.outcome.protectsPriority ? `Priority orders covered; ${quantity(left, plan.productId)} still short` : `${quantity(left, plan.productId)} still short, including a priority order`
    }
    if (plan.kind === 'bulk-transfer') return 'Would cover more near-term demand if receiving capacity allowed'
    if (plan.reason.code === 'ship-from-ask') return 'Answer Yes to check what it covers'
    if (plan.status === 'conditional') return 'Cannot be checked yet'
    return 'Does not reduce the shortage'
  }

  const costOf = (plan: Plan) => {
    if (plan.kind === 'ship-from') {
      if (!plan.cost) return 'Delivery cost per order not set for both warehouses'
      return plan.cost.amount === 0 ? 'No extra delivery cost' : `Estimated: ${format.money(plan.cost.amount)} more to deliver from ${locationName(plan.sourceLocationId ?? '')}`
    }
    if (plan.kind === 'supplier') {
      if (!plan.cost || plan.quantity === null) return 'Price unknown'
      const offer = workspace.suppliers.find((item) => item.id === plan.supplierId)?.offers.find((item) => item.productId === plan.productId && item.locationId === plan.locationId)
      const unitPrice = offer?.pricePerUnit.value
      const delivery = offer?.deliveryCharge?.value
      const parts = unitPrice != null ? `${format.number(plan.quantity)} × ${format.money(unitPrice)}${delivery != null ? ` + ${format.money(delivery)} delivery` : ''}` : ''
      return `Estimated: ${format.money(plan.cost.amount)}${parts ? ` (${parts})` : ''}${plan.costExcludesDelivery ? ' · delivery charge not given' : ''}`
    }
    if (plan.cost) {
      const route = workspace.routes.find((item) => item.id === plan.routeId)
      const quoted = route?.quotes.some((item) => item.quantity === plan.quantity)
      const parts = !quoted && route ? [route.costPerTrip != null ? `${format.money(route.costPerTrip)} trip` : '', route.costPerUnit != null ? `${format.number(plan.quantity ?? 0)} × ${format.money(route.costPerUnit)}` : ''].filter(Boolean).join(' + ') : ''
      return `Estimated: ${format.money(plan.cost.amount)} transfer cost${parts ? ` (${parts})` : ''}`
    }
    return 'Transfer cost not set'
  }

  const detailOf = (plan: Plan) => {
    const { reason } = plan
    const destination = locationName(plan.locationId)
    const storageNote = plan.spaceLeft !== null && plan.quantity !== null && plan.quantity === plan.spaceLeft
      ? ` Storage at ${destination} only has room for ${quantity(plan.spaceLeft, plan.productId)}.` : ''
    switch (reason.code) {
      case 'transfer-ok':
        return (reason.limit === null
          ? `${quantity(reason.quantity, plan.productId)} arrive before ${dueWhat(plan)} is due.`
          : `${quantity(reason.quantity, plan.productId)} fit within ${destination}’s receiving limit of ${quantity(reason.limit, plan.productId)} per day and arrive before ${dueWhat(plan)} is due.`) + storageNote
          + (plan.bookBy ? ` Book by ${format.dateTime(plan.bookBy)} to make it.` : '')
      case 'transfer-none-available': return `${locationName(plan.sourceLocationId ?? '')} has no ${productName(plan.productId)} to spare after its own orders.`
      case 'transfer-arrival-unknown': return 'Transfer arrival time is not confirmed, so this option cannot yet be checked against the order promise.'
      case 'transfer-late': return 'The confirmed transfer arrival is after the priority order promise.'
      case 'transfer-over-limit': return `${destination} can receive at most ${quantity(reason.limit, plan.productId)} per day. This transfer exceeds capacity by ${quantity(reason.excess, plan.productId)}.`
      case 'supplier-missing': return plan.request
        ? `Ask ${supplierName(plan.supplierId)} for ${quantity(plan.request.quantity, plan.productId)} by ${format.dateTime(plan.request.neededBy)}, then record their reply. Still missing: ${reason.missing.map((field) => missingLabels[field]).join(', ')}.`
        : `Missing: ${reason.missing.map((field) => missingLabels[field]).join(', ')}. Add these to check whether this option works.`
      case 'supplier-no-stock': return `${supplierName(plan.supplierId)} has no stock to offer.`
      case 'supplier-too-late': return 'Arrives after every affected order is due, so it does not help.'
      case 'supplier-ok': return `Arrives before ${reason.protectsPriority ? 'the priority order is due' : 'some affected orders are due'} and cuts the shortage from ${quantity(reason.exposedBefore, plan.productId)} to ${quantity(reason.exposedAfter, plan.productId)}.${storageNote}`
      case 'no-space': return `${destination} is full: it holds at most ${quantity(reason.limit, plan.productId)} of ${productName(plan.productId)} and already has that many.`
      case 'ship-from-ok': return `${locationName(plan.sourceLocationId ?? '')} has enough for the whole order and still covers its own orders.`
      case 'ship-from-short': return `${locationName(plan.sourceLocationId ?? '')} doesn't have enough for the whole order once its own orders are covered.`
      case 'ship-from-ask': return `${locationName(plan.sourceLocationId ?? '')} has enough. Can it deliver to ${locationName(plan.locationId)}'s customers? Only you know.`
    }
  }

  const titleOf = (plan: Plan) => {
    const suffix = manyProducts ? ` · ${productName(plan.productId)}` : ''
    if (plan.kind === 'transfer') return `Transfer stock from ${locationName(plan.sourceLocationId ?? '')}${suffix}`
    if (plan.kind === 'bulk-transfer') return `Transfer all ${quantity(plan.quantity ?? 0, plan.productId)} in one day${suffix}`
    if (plan.kind === 'ship-from') return `Ship ${customer(plan.orderId ?? '')}'s order from ${locationName(plan.sourceLocationId ?? '')}${suffix}`
    return `Buy emergency stock from ${supplierName(plan.supplierId)}${suffix}`
  }

  const descriptionOf = (plan: Plan) => {
    const destination = locationName(plan.locationId)
    if (plan.kind === 'transfer') return plan.quantity ? `Move ${quantity(plan.quantity, plan.productId)} to ${destination} before ${dueWhat(plan)} is due.` : `Nothing to move from ${locationName(plan.sourceLocationId ?? '')}.`
    if (plan.kind === 'bulk-transfer') return `Move the full available ${locationName(plan.sourceLocationId ?? '')} balance to ${destination}.`
    if (plan.kind === 'ship-from') return `Send ${plan.orderId ?? 'this order'} to ${customer(plan.orderId ?? '')} from ${locationName(plan.sourceLocationId ?? '')} instead of ${destination}. Approving moves the order there.`
    if (plan.quantity === null || plan.arrivalAt === null) {
      return plan.request
        ? `Ask ${supplierName(plan.supplierId)} for ${quantity(plan.request.quantity, plan.productId)} delivered to ${destination} by ${format.dateTime(plan.request.neededBy)}.`
        : `Ask ${supplierName(plan.supplierId)} for stock that arrives before the delayed shipment.`
    }
    return `Buy ${quantity(plan.quantity, plan.productId)} from ${supplierName(plan.supplierId)}, arriving ${format.dateTime(plan.arrivalAt)}.`
  }

  /** A warning when a fix costs more than the goods it saves sell for; null when fine or the price isn't known. */
  const worthNote = (plan: Plan) => {
    const price = productById.get(plan.productId)?.pricePerUnit
    if (price == null || !plan.cost || !plan.savedQuantity) return null
    const worth = plan.savedQuantity * price
    return plan.cost.amount > worth
      ? `Costs ${format.money(plan.cost.amount)}, more than the ${quantity(plan.savedQuantity, plan.productId)} it saves are worth (${format.money(worth)}).`
      : null
  }

  const planText = (plan: Plan) => ({
    title: titleOf(plan),
    description: descriptionOf(plan),
    detail: detailOf(plan),
    impact: impactOf(plan),
    cost: costOf(plan),
    statusLabel: statusLabel(plan),
    worthNote: worthNote(plan),
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
        label: `Transfer ${locationName(route?.fromLocationId ?? '')} → ${locationName(route?.toLocationId ?? '')} travel time`,
        value: route?.travelHours?.value != null ? `${route.travelHours.value} hours (arrives ${format.dateTime(fact.arrivalAt)})` : format.dateTime(fact.arrivalAt),
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

  /** Why an order line is short, in words: what's missing and whether anything is on its way. */
  const shortageText = (line: OrderCoverage) => {
    const due = orderById.get(line.orderId)?.dueAt
    const by = due ? ` before ${format.dateTime(due)}` : ''
    return `Short by ${quantity(line.ordered - line.covered, line.productId)} at ${locationName(line.locationId)}`
      + (line.arriving === 0 ? ` · no incoming shipment recorded${by}` : ` · counts ${quantity(line.arriving, line.productId)} arriving${by}`)
  }

  /** "Takes 6 hours · arrives Thu 3:00 pm if booked now", or why the time is unknown. */
  const routeTime = (route: TransferRoute) => {
    const arrival = routeArrival(route, planningNow(workspace))
    const hours = route.travelHours?.value
    if (arrival.at === null) return { text: 'Travel time unknown', known: false, evidence: null }
    const text = hours != null
      ? `Takes ${hours} ${hours === 1 ? 'hour' : 'hours'} · arrives ${format.dateTime(arrival.at)} if booked now`
      : `Arrives ${format.dateTime(arrival.at)} (fixed time from an older save; edit to set a travel time)`
    return { text, known: true, evidence: arrival.evidence }
  }

  return { locationName, placeName, productName, supplierName, customer, quantity, totalUnit, totalQuantity, planText, unverifiedText, conflictText, shortageText, routeTime }
}

export type Wording = ReturnType<typeof createWording>
