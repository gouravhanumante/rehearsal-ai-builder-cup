import type { Workspace } from './model.js'
import { rehearse } from './plan.js'

/**
 * Just enough of a workspace to re-run one plan: the server re-checks an approval without
 * receiving a whole business. Everything a plan reads is kept; everything else is dropped.
 */
export function sliceForPlan(workspace: Workspace, planId: string): Workspace | null {
  const plan = rehearse(workspace).plans.find((item) => item.id === planId)
  if (!plan) return null
  const { locationId, productId } = plan
  const hasProduct = (lines: { productId: string }[]) => lines.some((line) => line.productId === productId)

  const shipments = workspace.shipments.filter((shipment) => shipment.locationId === locationId && hasProduct(shipment.lines))
  const shipmentIds = new Set(shipments.map((shipment) => shipment.id))
  const routes = workspace.routes.filter((route) => route.toLocationId === locationId)
  const locationIds = new Set([locationId, ...routes.map((route) => route.fromLocationId)])

  return {
    ...workspace,
    approval: null,
    products: workspace.products.filter((product) => product.id === productId),
    locations: workspace.locations.filter((location) => locationIds.has(location.id)),
    stock: workspace.stock.filter((record) => record.productId === productId && locationIds.has(record.locationId)),
    storageLimits: workspace.storageLimits?.filter((item) => item.productId === productId && locationIds.has(item.locationId)),
    orders: workspace.orders.filter((order) => order.locationId === locationId && hasProduct(order.lines)),
    shipments,
    disruptions: workspace.disruptions.filter((disruption) => shipmentIds.has(disruption.shipmentId)),
    routes,
    suppliers: workspace.suppliers
      .map((supplier) => ({ ...supplier, offers: supplier.offers.filter((offer) => offer.productId === productId && offer.locationId === locationId) }))
      .filter((supplier) => supplier.offers.length > 0),
    conflictDecisions: workspace.conflictDecisions.filter((decision) => decision.conflictId.endsWith(`:${productId}`)),
  }
}
