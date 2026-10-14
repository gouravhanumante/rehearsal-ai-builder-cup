import type { DemoOrder, DistributorData } from '../data/distributorDemo'
import type { RecoveryPlan, UnverifiedFact } from '../data/demoDistributor'
import { formatDateTime } from '../lib/istTime'

type SupplyEvent = { cases: number; at: string }

const byDueThenPriority = (first: DemoOrder, second: DemoOrder) =>
  Date.parse(first.dueAt) - Date.parse(second.dueAt)
  || Number(second.priority === 'protected') - Number(first.priority === 'protected')

/**
 * Hands out stock to orders in due-date order. Stock only counts for an order if it
 * has arrived by the time that order is due.
 */
function allocate(commitments: DemoOrder[], onHand: number, extraSupply: SupplyEvent[]) {
  let used = 0
  return [...commitments].sort(byDueThenPriority).map((order) => {
    const arrived = onHand + extraSupply
      .filter((supply) => Date.parse(supply.at) <= Date.parse(order.dueAt))
      .reduce((total, supply) => total + supply.cases, 0)
    const availableCases = Math.max(0, Math.min(order.cases, arrived - used))
    used += availableCases
    return { orderId: order.id, availableCases }
  })
}

const money = (value: number) => `$${Number.isInteger(value) ? value : value.toFixed(2)}`

export function rehearseDistributor(data: DistributorData) {
  const { inventory, orders, shipment, warehouses, suppliers, sampleTransferCosts, transfer } = data
  const northCases = inventory.northCases.value
  const southCases = inventory.southUnallocatedCases.value
  const commitmentsBeforeInbound = orders.filter((order) => Date.parse(order.dueAt) < Date.parse(shipment.confirmedArrivalAt))
  const unaffectedOrderIds = orders.filter((order) => !commitmentsBeforeInbound.includes(order)).map((order) => order.id)
  const priorityCommitments = commitmentsBeforeInbound.filter((order) => order.priority === 'protected')

  function outcome(extraSupply: SupplyEvent[]) {
    const allocations = allocate(commitmentsBeforeInbound, northCases, extraSupply)
    const shortfall = (order: DemoOrder) => order.cases - (allocations.find((item) => item.orderId === order.id)?.availableCases ?? 0)
    return {
      allocations,
      exposedCases: commitmentsBeforeInbound.reduce((total, order) => total + shortfall(order), 0),
      priorityProtected: priorityCommitments.every((order) => shortfall(order) === 0),
    }
  }

  const baseline = outcome([])
  const describeOutcome = (result: ReturnType<typeof outcome>) =>
    `${priorityCommitments.length === 0 || result.priorityProtected ? 'Protects the priority order' : 'Priority order remains exposed'}; ${result.exposedCases} cases remain exposed`

  const manualFacts: UnverifiedFact[] = [
    ...(inventory.northCases.evidence.kind === 'manual' ? [{ label: `${warehouses.north.name} stock`, value: `${northCases} cases`, target: { type: 'inventory' as const } }] : []),
    ...commitmentsBeforeInbound
      .filter((order) => order.evidence.kind === 'manual')
      .map((order) => ({ label: `${order.customer} order`, value: `${order.cases} cases due ${formatDateTime(order.dueAt)}`, target: { type: 'order' as const, orderId: order.id } })),
  ]
  const southManual: UnverifiedFact[] = inventory.southUnallocatedCases.evidence.kind === 'manual'
    ? [{ label: `${warehouses.south.name} stock`, value: `${southCases} cases`, target: { type: 'inventory' } }]
    : []

  const feasibleTransferCases = Math.min(southCases, warehouses.north.receivingLimitPerDay)
  const transferArrivalKnown = transfer.confirmed && transfer.expectedArrivalAt !== null
  const withTransfer = outcome(transferArrivalKnown ? [{ cases: feasibleTransferCases, at: transfer.expectedArrivalAt }] : [])
  const transferOnTime = transferArrivalKnown
    && priorityCommitments.every((order) => Date.parse(transfer.expectedArrivalAt) <= Date.parse(order.dueAt))
  const transferStatus = feasibleTransferCases <= 0
    ? 'rejected'
    : !transferArrivalKnown
      ? 'conditional'
      : transferOnTime
        ? 'ready'
        : 'rejected'
  const rejectedTransferExcess = southCases - warehouses.north.receivingLimitPerDay
  const quotedTransferCost: Record<number, number> = { 8: sampleTransferCosts.eightCases, 14: sampleTransferCosts.fourteenCases }
  const transferCost = (cases: number) => cases in quotedTransferCost
    ? `Estimated: $${quotedTransferCost[cases]} transfer cost`
    : `Transfer cost not quoted for ${cases} cases`

  const statusLabel = (status: RecoveryPlan['status'], unverified: UnverifiedFact[]) =>
    status === 'ready' ? (unverified.length ? 'Ready · unverified' : 'Ready to use') : status === 'conditional' ? 'Needs information' : "Can't be done"

  const transferUnverified = [...manualFacts, ...southManual]
  const plans: RecoveryPlan[] = [
    {
      id: 'transfer',
      title: `Transfer stock from ${warehouses.south.name}`,
      description: `Move ${feasibleTransferCases} available cases to ${warehouses.north.name} before the priority order is due.`,
      impact: describeOutcome(withTransfer),
      cost: transferCost(feasibleTransferCases),
      status: transferStatus,
      statusLabel: statusLabel(transferStatus, transferUnverified),
      unverifiedFacts: transferUnverified,
      outcome: { exposedCases: withTransfer.exposedCases, protectsPriority: withTransfer.priorityProtected },
      detail: feasibleTransferCases <= 0
        ? `${warehouses.south.name} has no unallocated stock to move.`
        : !transferArrivalKnown
          ? 'Transfer arrival time is not confirmed, so this option cannot yet be checked against the order promise.'
          : !transferOnTime
            ? 'The confirmed transfer arrival is after the priority order promise.'
            : `${feasibleTransferCases} cases fit within ${warehouses.north.name}’s receiving limit of ${warehouses.north.receivingLimitPerDay} cases per day and arrive before the priority order is due.`,
    },
    ...suppliers.map((supplier): RecoveryPlan => {
      const id = `supplier-${supplier.id}`
      const title = `Buy emergency stock from ${supplier.name}`
      const stock = supplier.availableCases.value
      const price = supplier.pricePerCase.value
      const arrival = supplier.arrivalAt.value

      if (stock === null || price === null || arrival === null) {
        const missing = [stock === null && 'stock available', price === null && 'price per case', arrival === null && 'arrival time']
          .filter((item): item is string => Boolean(item))
        return {
          id, title, supplierId: supplier.id,
          description: `Ask ${supplier.name} for stock that arrives before the delayed shipment.`,
          impact: 'Cannot be checked yet',
          cost: 'Price unknown',
          status: 'conditional',
          statusLabel: 'Needs information',
          unverifiedFacts: [],
          detail: `Missing: ${missing.join(', ')}. Add these to check whether this option works.`,
        }
      }

      const casesToBuy = Math.min(stock, baseline.exposedCases)
      const withSupplier = outcome([{ cases: casesToBuy, at: arrival }])
      const helps = casesToBuy > 0 && withSupplier.exposedCases < baseline.exposedCases
      const supplierManual: UnverifiedFact[] = [
        { label: 'Stock available', value: `${stock} cases`, evidence: supplier.availableCases.evidence },
        { label: 'Price per case', value: money(price), evidence: supplier.pricePerCase.evidence },
        { label: 'Arrival time', value: formatDateTime(arrival), evidence: supplier.arrivalAt.evidence },
      ].filter((fact) => fact.evidence?.kind === 'manual')
        .map((fact): UnverifiedFact => ({ label: `${supplier.name} · ${fact.label}`, value: fact.value, target: { type: 'supplier', supplierId: supplier.id } }))
      const unverified = [...manualFacts, ...supplierManual]

      return {
        id, title, supplierId: supplier.id,
        description: `Buy ${casesToBuy} cases from ${supplier.name}, arriving ${formatDateTime(arrival)}.`,
        impact: helps ? describeOutcome(withSupplier) : 'Does not reduce the shortage',
        cost: `Estimated: ${money(casesToBuy * price)} (${casesToBuy} × ${money(price)})`,
        status: helps ? 'ready' : 'rejected',
        statusLabel: statusLabel(helps ? 'ready' : 'rejected', unverified),
        unverifiedFacts: helps ? unverified : [],
        outcome: { exposedCases: withSupplier.exposedCases, protectsPriority: withSupplier.priorityProtected },
        detail: helps
          ? `Arrives before ${withSupplier.priorityProtected ? 'the priority order is due' : 'some affected orders are due'} and cuts the shortage from ${baseline.exposedCases} to ${withSupplier.exposedCases} cases.`
          : stock <= 0
            ? `${supplier.name} has no stock to offer.`
            : 'Arrives after every affected order is due, so it does not help.',
      }
    }),
    // Only worth showing when moving everything would break the receiving limit; otherwise it is
    // the same move as the transfer above.
    ...(rejectedTransferExcess > 0 ? [{
      id: 'bulk-transfer',
      title: `Transfer all ${southCases} cases in one day`,
      description: `Move the full available ${warehouses.south.name} balance to ${warehouses.north.name}.`,
      impact: 'Would cover more near-term demand if receiving capacity allowed',
      cost: transferCost(southCases),
      status: 'rejected' as const,
      statusLabel: "Can't be done",
      unverifiedFacts: [],
      detail: `${warehouses.north.name} can receive at most ${warehouses.north.receivingLimitPerDay} cases per day. This transfer exceeds capacity by ${rejectedTransferExcess} cases.`,
    }] : []),
  ]

  const impact = {
    affectedOrderCount: commitmentsBeforeInbound.length,
    casesExposed: baseline.exposedCases,
    northAllocations: baseline.allocations,
    unaffectedOrderIds,
  }

  return { impact, plans }
}

export type Rehearsal = ReturnType<typeof rehearseDistributor>

/**
 * The Overview shows one plan: a ready plan that protects the priority order first, then the one
 * leaving the fewest cases exposed, then the one relying on fewer typed-in details.
 */
export function recommendPlan(plans: RecoveryPlan[]) {
  return plans
    .filter((plan) => plan.status === 'ready' && plan.outcome)
    .sort((first, second) => Number(second.outcome?.protectsPriority) - Number(first.outcome?.protectsPriority)
      || (first.outcome?.exposedCases ?? 0) - (second.outcome?.exposedCases ?? 0)
      || first.unverifiedFacts.length - second.unverifiedFacts.length)[0]
}
