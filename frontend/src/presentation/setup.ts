import type { Workspace } from '../../../shared/planner/model'

export type SetupStepId = 'locations' | 'products' | 'stock' | 'orders' | 'shipments' | 'sources'
export type SetupStep = { id: SetupStepId; title: string; description: string; count: number; optional: boolean; done: boolean }

/** What a new business has told us so far, and the next thing worth adding. Nothing here blocks anything. */
export function setupProgress(workspace: Workspace) {
  const sourceCount = workspace.suppliers.length + workspace.routes.length
  const make = (id: SetupStepId, title: string, description: string, count: number, optional = false): SetupStep =>
    ({ id, title, description, count, optional, done: count > 0 })
  const steps: SetupStep[] = [
    make('locations', 'Locations', 'Your warehouses, stores or distribution centres.', workspace.locations.length),
    make('products', 'Products', 'What you stock and sell.', workspace.products.length),
    make('stock', 'Stock counts', 'How much of each product is at each location.', workspace.stock.length),
    make('orders', 'Open orders', 'Customer orders and when they are due.', workspace.orders.length),
    make('shipments', 'Incoming shipments', 'What suppliers are sending you and when.', workspace.shipments.length),
    make('sources', 'Backup sources', 'Other suppliers and transfer routes you could use in a shortage.', sourceCount, true),
  ]
  const next = steps.find((step) => !step.done && !step.optional) ?? null
  const required = steps.filter((step) => !step.optional)
  return {
    steps,
    next,
    requiredDone: required.filter((step) => step.done).length,
    requiredTotal: required.length,
    // A delay can only be reported against a shipment we know about.
    canReportDelay: workspace.shipments.length > 0,
    isEmpty: steps.every((step) => step.count === 0),
  }
}
