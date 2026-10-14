import type { Evidence, Workspace } from '../../../shared/planner/model'
import { rankPlans, type Rehearsal } from '../../../shared/planner/plan'
import type { Format } from '../presentation/format'
import type { Wording } from '../presentation/planText'

export const MAX_ASSISTANT_FACTS = 40
export const MAX_ASSISTANT_OPTIONS = 8

type AssistantFact = { id: string; label: string; value: string | null; evidenceStatus: 'confirmed' | 'unverified' | 'unknown'; source: string }

// Ask AI only needs to know whether a value is known; whether it was typed in or proven is shown in the app, not discussed in chat.
const evidenceStatus = (evidence: Evidence | null): AssistantFact['evidenceStatus'] => (evidence ? 'confirmed' : 'unknown')

const sourceOf = (evidence: Evidence | null) =>
  !evidence ? 'Not known yet' : evidence.kind === 'document' ? `Document: ${evidence.source}`.slice(0, 160) : evidence.kind === 'sample' ? 'Sample data' : 'Your records'

/**
 * What Ask AI is allowed to see. Facts behind the shortage come first; anything that does not
 * fit is counted in an explicit "not shown" fact, so the model never answers from a silently
 * partial picture.
 */
export function buildAssistantContext(workspace: Workspace, rehearsal: Rehearsal, format: Format, words: Wording) {
  const fact = (id: string, label: string, value: string | null, evidence: Evidence | null): AssistantFact =>
    ({ id: id.slice(0, 64), label: label.slice(0, 100), value: value?.slice(0, 500) ?? null, evidenceStatus: evidenceStatus(evidence), source: sourceOf(evidence) })
  const affectedIds = new Set(rehearsal.impact.affectedOrderIds)
  const unaffected = workspace.orders.filter((order) => !affectedIds.has(order.id))
  const seen = new Set<string>()
  const once = (item: AssistantFact) => (seen.has(item.id) ? [] : (seen.add(item.id), [item]))

  const essential: AssistantFact[] = rehearsal.impact.groups.flatMap((group) => {
    const shipment = workspace.shipments.find((item) => item.id === group.shipmentId)
    const stockAt = (locationId: string) => workspace.stock.find((record) => record.locationId === locationId && record.productId === group.productId)
    const here = stockAt(group.locationId)
    const product = words.productName(group.productId)
    return [
      ...(group.kind === 'shortage'
        ? once({ id: `short-${group.locationId}-${group.productId}`, label: 'Stock shortage (nothing late)', value: `${words.quantity(group.exposedQuantity ?? 0, group.productId)} of ${product} short at ${words.locationName(group.locationId)}: stock plus recorded deliveries do not cover the orders`, evidenceStatus: 'confirmed', source: 'Planner' })
        : once({ id: `delay-${group.shipmentId}`, label: 'Delayed inbound shipment', value: shipment ? `${shipment.lines.map((line) => words.quantity(line.quantity, line.productId)).join(', ')} from ${shipment.supplierName} to ${words.locationName(shipment.locationId)}; now expected ${format.dateTime(shipment.confirmedArrivalAt)}` : null, evidenceStatus: 'confirmed', source: shipment?.updateSource ?? 'Supplier update' })),
      ...once(fact(`stock-${group.locationId}-${group.productId}`, `${words.locationName(group.locationId)} stock of ${product}`, here ? words.quantity(here.available.value, group.productId) : null, here?.available.evidence ?? null)),
      ...workspace.routes.filter((route) => route.toLocationId === group.locationId).flatMap((route) => {
        const source = stockAt(route.fromLocationId)
        return [
          ...once(fact(`stock-${route.fromLocationId}-${group.productId}`, `${words.locationName(route.fromLocationId)} unallocated ${product}`, source ? words.quantity(source.available.value, group.productId) : null, source?.available.evidence ?? null)),
          ...once(fact(`route-${route.id}`, `Transfer ${words.locationName(route.fromLocationId)} to ${words.locationName(route.toLocationId)} travel time`, words.routeTime(route).known ? words.routeTime(route).text : null, words.routeTime(route).evidence)),
        ]
      }),
      ...workspace.suppliers.flatMap((supplier) => supplier.offers
        .filter((offer) => offer.productId === group.productId && offer.locationId === group.locationId)
        .flatMap((offer) => [
          ...once(fact(`${supplier.id}-${offer.productId}-stock`, `${supplier.name} ${product} available`, offer.available.value === null ? null : words.quantity(offer.available.value, offer.productId), offer.available.evidence)),
          ...once(fact(`${supplier.id}-${offer.productId}-price`, `${supplier.name} price per unit`, offer.pricePerUnit.value === null ? null : format.money(offer.pricePerUnit.value), offer.pricePerUnit.evidence)),
          ...once(fact(`${supplier.id}-${offer.productId}-arrival`, `${supplier.name} arrival`, offer.arrivalAt.value === null ? null : format.dateTime(offer.arrivalAt.value), offer.arrivalAt.evidence)),
        ])),
    ]
  })
  const conflicts: AssistantFact[] = rehearsal.conflicts.map((conflict) => {
    const text = words.conflictText(conflict)
    return {
      id: `conflict-${conflict.priorityOrderId}`.slice(0, 64),
      label: 'Stock conflict between orders',
      value: `${text.question} ${text.earlier} is due first; ${text.priority} is priority. ${conflict.decided ? 'User chose' : 'Not answered yet; default'}: ${conflict.winner === 'priority' ? 'priority order' : 'order due first'}.`,
      evidenceStatus: 'confirmed',
      source: 'Planner',
    }
  })
  const affectedOrders = workspace.orders
    .filter((order) => affectedIds.has(order.id))
    .map((order) => fact(order.id, `${order.customer} order (affected)`, `${order.lines.map((line) => `${words.quantity(line.quantity, line.productId)} ${words.productName(line.productId)}`).join(', ')} due ${format.dateTime(order.dueAt)} from ${words.locationName(order.locationId)}; ${order.priority} priority`, order.evidence))
  const laterOrders: AssistantFact[] = unaffected.length === 0 ? [] : [{
    id: 'orders-not-affected',
    label: 'Orders not part of this shortage',
    value: `${unaffected.length} orders; due after the delayed stock arrives, or for other products or locations`,
    evidenceStatus: 'confirmed',
    source: 'Counted by the planner',
  }]

  const all = [...essential, ...conflicts, ...affectedOrders, ...laterOrders]
  const fits = all.length <= MAX_ASSISTANT_FACTS
  const kept = fits ? all : all.slice(0, MAX_ASSISTANT_FACTS - 1)
  const omittedCount = all.length - kept.length
  const facts = fits ? kept : [...kept, {
    id: 'not-shown',
    label: 'Facts not shown to the assistant',
    value: `${omittedCount} more facts exist but were left out to keep the request small`,
    evidenceStatus: 'unknown' as const,
    source: 'Rehearsal',
  }]

  const shown = rankPlans(rehearsal.plans).slice(0, MAX_ASSISTANT_OPTIONS)
  const options = shown.map((plan, index) => {
    const text = words.planText(plan)
    return {
      // Planner ids can be long; short ids keep within the API's limit.
      id: `option-${index + 1}`,
      title: text.title.slice(0, 140),
      status: plan.status,
      reason: text.detail.slice(0, 500),
      outcome: text.impact.slice(0, 300),
      cost: text.cost.slice(0, 120),
    }
  })

  return {
    facts,
    options,
    // Shown in the panel only; the API gets plain statuses.
    optionLabels: Object.fromEntries(shown.map((plan, index) => [`option-${index + 1}`, plan.status === 'ready' ? 'Ready to use' : words.planText(plan).statusLabel])),
    omittedFacts: omittedCount,
    omittedOptions: Math.max(0, rehearsal.plans.length - MAX_ASSISTANT_OPTIONS),
  }
}
