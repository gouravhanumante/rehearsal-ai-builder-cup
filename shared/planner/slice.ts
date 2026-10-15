import type { Workspace } from './model.js'
import { outstandingOrders } from './ledger.js'
import { rehearse } from './plan.js'

/**
 * Just enough of a workspace to re-run one plan: the server re-checks an approval without
 * receiving a whole business. Everything a plan reads is kept; everything else is dropped.
 */
export function sliceForPlan(workspace: Workspace, planId: string): Workspace | null {
  const plan = rehearse(workspace).plans.find((item) => item.id === planId)
  if (!plan) return null
  const { locationId, productId } = plan
  // Shipping an order from elsewhere also needs that location's orders and every product the order holds.
  const shipFrom = plan.kind === 'ship-from' ? plan.sourceLocationId : undefined
  const moved = workspace.orders.find((order) => order.id === plan.orderId)
  const productIds = new Set([productId, ...(shipFrom && moved ? moved.lines.map((line) => line.productId) : [])])
  const hasProduct = (lines: { productId: string }[]) => lines.some((line) => productIds.has(line.productId))
  const routes = workspace.routes.filter((route) => route.toLocationId === locationId)
  const sources = new Set(routes.map((route) => route.fromLocationId))
  // Transfers only move what a source can spare, so its own orders and deliveries matter too.
  const served = (id: string) => id === locationId || id === shipFrom || sources.has(id)

  const shipments = workspace.shipments.filter((shipment) => served(shipment.locationId) && (hasProduct(shipment.lines)
    || (shipment.locationId === locationId && shipment.fromLocationId)))
  const shipmentProducts = new Set(shipments.flatMap((shipment) => shipment.lines.map((line) => line.productId)))
  const shipmentIds = new Set(shipments.map((shipment) => shipment.id))
  const locationIds = new Set([locationId, ...sources, ...(shipFrom ? [shipFrom] : [])])

  return {
    ...workspace,
    approval: null,
    products: workspace.products.filter((product) => productIds.has(product.id) || shipmentProducts.has(product.id)),
    locations: workspace.locations.filter((location) => locationIds.has(location.id)),
    // Stock is worked out from movements, and transfers already received here use up today's receiving limit.
    // Orders go already reduced to what is still to be sent, so sends keep their stock effect but lose their order link.
    movements: workspace.movements
      .filter((movement) => (productIds.has(movement.productId) && locationIds.has(movement.locationId))
        || ((movement.kind === 'receipt' || movement.kind === 'transfer-return') && movement.locationId === locationId && movement.fromLocationId))
      .map(({ orderId: _orderId, ...movement }) => movement),
    stock: workspace.stock.filter((record) => productIds.has(record.productId) && locationIds.has(record.locationId)),
    storageLimits: workspace.storageLimits?.filter((item) => productIds.has(item.productId) && locationIds.has(item.locationId)),
    orders: outstandingOrders(workspace).orders.filter((order) => served(order.locationId) && hasProduct(order.lines)),
    shipments,
    disruptions: workspace.disruptions.filter((disruption) => shipmentIds.has(disruption.shipmentId)),
    routes,
    suppliers: workspace.suppliers
      .map((supplier) => ({ ...supplier, offers: supplier.offers.filter((offer) => offer.productId === productId && offer.locationId === locationId) }))
      .filter((supplier) => supplier.offers.length > 0),
    conflictDecisions: workspace.conflictDecisions.filter((decision) => decision.conflictId.endsWith(`:${productId}`)),
  }
}
