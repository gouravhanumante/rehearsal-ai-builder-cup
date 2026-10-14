import type { Workspace } from '../../../shared/planner/model'
import { spareStock, type Rehearsal } from '../../../shared/planner/plan'

export type RouteQuestion = { from: string; to: string; productId: string; quantity: number }
export type DeliveryQuestion = { from: string; forLocation: string; orderIds: string[] }

/**
 * Questions only the user can answer, asked only when the answer would open a way to fix a shortage:
 * can stock move from one place to another, and can a place deliver to another place's customers.
 */
export function openQuestions(workspace: Workspace, rehearsal: Rehearsal) {
  const routes = new Map<string, RouteQuestion>()
  for (const group of rehearsal.impact.groups.filter((item) => (item.exposedQuantity ?? 0) > 0)) {
    for (const record of workspace.stock.filter((item) => item.productId === group.productId && item.locationId !== group.locationId && item.available.value > 0)) {
      const from = record.locationId
      const to = group.locationId
      const key = `${from}|${to}`
      const answered = workspace.routes.some((route) => route.fromLocationId === from && route.toLocationId === to)
        || (workspace.noTransfers ?? []).some((pair) => pair.fromLocationId === from && pair.toLocationId === to)
      if (answered || routes.has(key)) continue
      const spare = spareStock(workspace, from, group.productId)
      if (spare > 0) routes.set(key, { from, to, productId: group.productId, quantity: spare })
    }
  }

  const deliveries = new Map<string, DeliveryQuestion>()
  for (const plan of rehearsal.plans.filter((item) => item.reason.code === 'ship-from-ask' && item.sourceLocationId && item.orderId)) {
    const key = `${plan.sourceLocationId}|${plan.locationId}`
    const existing = deliveries.get(key)
    if (existing) { if (!existing.orderIds.includes(plan.orderId!)) existing.orderIds.push(plan.orderId!) }
    else deliveries.set(key, { from: plan.sourceLocationId!, forLocation: plan.locationId, orderIds: [plan.orderId!] })
  }

  return { routes: [...routes.values()], deliveries: [...deliveries.values()] }
}
