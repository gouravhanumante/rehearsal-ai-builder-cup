import type { DistributorData, Evidence } from '../data/distributorDemo'
import { formatDateTime } from '../lib/istTime'
import type { Rehearsal } from './rehearseDistributor'

export const MAX_ASSISTANT_FACTS = 40
export const MAX_ASSISTANT_OPTIONS = 8

type AssistantFact = { id: string; label: string; value: string | null; evidenceStatus: 'confirmed' | 'unverified' | 'unknown'; source: string }

const evidenceStatus = (evidence: Evidence | null): AssistantFact['evidenceStatus'] =>
  !evidence ? 'unknown' : evidence.kind === 'manual' ? 'unverified' : 'confirmed'

const sourceOf = (evidence: Evidence | null) =>
  !evidence ? 'Not known yet' : evidence.kind === 'manual' ? 'Typed in by the user, no document' : evidence.kind === 'document' ? `Document: ${evidence.source}`.slice(0, 160) : 'Sample data'

/**
 * What Ask AI is allowed to see. Facts behind the shortage come first; anything that does not
 * fit is counted in an explicit "not shown" fact, so the model never answers from a silently
 * partial picture.
 */
export function buildAssistantContext(data: DistributorData, rehearsal: Rehearsal) {
  const { inventory, warehouses, shipment, product } = data
  const fact = (id: string, label: string, value: string | null, evidence: Evidence | null): AssistantFact =>
    ({ id: id.slice(0, 64), label: label.slice(0, 100), value: value?.slice(0, 500) ?? null, evidenceStatus: evidenceStatus(evidence), source: sourceOf(evidence) })
  const affectedIds = new Set(rehearsal.impact.northAllocations.map((allocation) => allocation.orderId))
  const unaffected = data.orders.filter((order) => !affectedIds.has(order.id))

  const essential: AssistantFact[] = [
    { id: 'shipment', label: 'Confirmed inbound shipment', value: `${shipment.cases} cases from ${shipment.supplier}; expected ${formatDateTime(shipment.confirmedArrivalAt)}`, evidenceStatus: 'confirmed', source: shipment.updateSource },
    fact('north-stock', `${warehouses.north.name} stock`, `${inventory.northCases.value} cases of ${product.name}`, inventory.northCases.evidence),
    fact('south-stock', `${warehouses.south.name} stock`, `${inventory.southUnallocatedCases.value} unallocated cases`, inventory.southUnallocatedCases.evidence),
    ...data.suppliers.flatMap((supplier) => [
      fact(`${supplier.id}-stock`, `${supplier.name} stock available`, supplier.availableCases.value === null ? null : `${supplier.availableCases.value} cases`, supplier.availableCases.evidence),
      fact(`${supplier.id}-price`, `${supplier.name} price per case`, supplier.pricePerCase.value === null ? null : `$${supplier.pricePerCase.value}`, supplier.pricePerCase.evidence),
      fact(`${supplier.id}-arrival`, `${supplier.name} arrival`, supplier.arrivalAt.value === null ? null : formatDateTime(supplier.arrivalAt.value), supplier.arrivalAt.evidence),
    ]),
  ]
  const affectedOrders = data.orders
    .filter((order) => affectedIds.has(order.id))
    .map((order) => fact(order.id, `${order.customer} order (affected)`, `${order.cases} cases due ${formatDateTime(order.dueAt)}; ${order.priority} priority`, order.evidence))
  const laterOrders: AssistantFact[] = unaffected.length === 0 ? [] : [{
    id: 'orders-after-arrival',
    label: 'Orders due after the delayed shipment arrives',
    value: `${unaffected.length} orders, ${unaffected.reduce((total, order) => total + order.cases, 0)} cases; not part of this shortage`,
    evidenceStatus: 'confirmed',
    source: 'Counted by the planner',
  }]

  const all = [...essential, ...affectedOrders, ...laterOrders]
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

  const options = rehearsal.plans.slice(0, MAX_ASSISTANT_OPTIONS).map((plan) => ({
    id: plan.id,
    title: plan.title.slice(0, 140),
    status: plan.status,
    reason: `${plan.detail}${plan.unverifiedFacts.length ? ` Relies on typed-in, unverified details: ${plan.unverifiedFacts.map((item) => item.label).join(', ')}.` : ''}`.slice(0, 500),
    outcome: plan.impact.slice(0, 300),
    cost: plan.cost.slice(0, 120),
  }))

  return { facts, options, omittedFacts: omittedCount, omittedOptions: Math.max(0, rehearsal.plans.length - MAX_ASSISTANT_OPTIONS) }
}
