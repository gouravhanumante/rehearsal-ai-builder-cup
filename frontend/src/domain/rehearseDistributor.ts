import { distributorDemo, type DemoOrder } from '../data/distributorDemo'
import type { RecoveryPlan } from '../data/demoDistributor'

export function rehearseDistributor(data = distributorDemo) {
  const { inventory, orders, shipment, warehouses, alternativeSupplier, sampleTransferCosts, transfer } = data
  const commitmentsBeforeInbound = orders
    .filter((order) => Date.parse(order.dueAt) < Date.parse(shipment.confirmedArrivalAt))
    .sort((first, second) => {
      const priorityOrder = Number(second.priority === 'protected') - Number(first.priority === 'protected')
      return priorityOrder || Date.parse(first.dueAt) - Date.parse(second.dueAt)
    })
  const totalDemandBeforeInbound = commitmentsBeforeInbound.reduce((total, order) => total + order.cases, 0)
  const baselineShortage = Math.max(0, totalDemandBeforeInbound - inventory.northCases)
  const feasibleTransferCases = Math.min(inventory.southUnallocatedCases, warehouses.north.receivingLimitPerDay)

  function allocateNorthStock(commitments: DemoOrder[]) {
    let remainingCases = inventory.northCases
    return commitments.map((order) => {
      const availableCases = Math.min(order.cases, remainingCases)
      remainingCases -= availableCases
      return { orderId: order.id, availableCases }
    })
  }

  const northAllocations = allocateNorthStock(commitmentsBeforeInbound)
  const priorityCommitment = commitmentsBeforeInbound.find((order) => order.priority === 'protected')
  const transferArrivalKnown = transfer.confirmed && transfer.expectedArrivalAt !== null
  const transferOnTime = transferArrivalKnown
    && priorityCommitment !== undefined
    && Date.parse(transfer.expectedArrivalAt) <= Date.parse(priorityCommitment.dueAt)
  const priorityProtectedWithTransfer = transferOnTime
    && priorityCommitment !== undefined
    && inventory.northCases + feasibleTransferCases >= priorityCommitment.cases
  const shortageAfterTransfer = Math.max(0, totalDemandBeforeInbound - inventory.northCases - feasibleTransferCases)
  const emergencyCases = 12
  const shortageAfterEmergencySupplier = Math.max(0, totalDemandBeforeInbound - inventory.northCases - emergencyCases)
  const rejectedTransferExcess = inventory.southUnallocatedCases - warehouses.north.receivingLimitPerDay
  const emergencySupplierKnown = alternativeSupplier.confirmed
    && alternativeSupplier.availableCases !== null
    && alternativeSupplier.availableCases >= emergencyCases
    && alternativeSupplier.quotedPrice !== null
    && alternativeSupplier.confirmedArrivalAt !== null
    && priorityCommitment !== undefined
    && Date.parse(alternativeSupplier.confirmedArrivalAt) <= Date.parse(priorityCommitment.dueAt)
  const transferStatus = feasibleTransferCases <= 0
    ? 'rejected'
    : !transferArrivalKnown
      ? 'conditional'
      : transferOnTime
        ? 'ready'
        : 'rejected'

  const impact = {
    affectedOrderCount: commitmentsBeforeInbound.length,
    casesExposed: baselineShortage,
    nextCommitment: commitmentsBeforeInbound[0],
    northAllocations,
  }

  const plans: RecoveryPlan[] = [
    {
      id: 'transfer',
      title: 'Transfer stock from South Hub',
      description: `Move ${feasibleTransferCases} available cases to North Hub before Thursday dispatch.`,
      impact: `${priorityProtectedWithTransfer ? 'Protects the priority order' : 'Priority order remains exposed'}; ${shortageAfterTransfer} cases remain exposed`,
      cost: `Estimated: $${sampleTransferCosts.eightCases} transfer cost`,
      status: transferStatus,
      statusLabel: transferStatus === 'ready' ? 'Ready to use' : transferStatus === 'conditional' ? 'Needs information' : "Can't be done",
      detail: !transferArrivalKnown
        ? 'Transfer arrival time is not confirmed, so this option cannot yet be checked against the order promise.'
        : !transferOnTime
          ? 'The confirmed transfer arrival is after the priority order promise.'
          : `${feasibleTransferCases} cases fit within North Hub’s receiving limit of ${warehouses.north.receivingLimitPerDay} cases per day and arrive before the priority order is due.`,
    },
    {
      id: 'expedite',
      title: 'Request an emergency supplier shipment',
      description: `Ask ${alternativeSupplier.name} to deliver ${emergencyCases} cases by Thursday morning.`,
      impact: `All Thursday commitments covered; ${shortageAfterEmergencySupplier} Friday cases remain exposed`,
      cost: alternativeSupplier.quotedPrice === null ? 'Price and availability unconfirmed' : `Quoted price: $${alternativeSupplier.quotedPrice}`,
      status: emergencySupplierKnown ? 'ready' : 'conditional',
      statusLabel: emergencySupplierKnown ? 'Ready to use' : 'Needs information',
      detail: emergencySupplierKnown
        ? `${alternativeSupplier.availableCases} cases, quoted price, and on-time arrival are confirmed.`
        : `${alternativeSupplier.name} stock, price, and on-time arrival must all be confirmed. This is not yet a feasible plan.`,
    },
    {
      id: 'bulk-transfer',
      title: `Transfer all ${inventory.southUnallocatedCases} cases in one day`,
      description: 'Move the full available South Hub balance to North Hub.',
      impact: 'Would cover more near-term demand if receiving capacity allowed',
      cost: `Estimated: $${sampleTransferCosts.fourteenCases} transfer cost`,
      status: rejectedTransferExcess > 0 ? 'rejected' : 'ready',
      statusLabel: rejectedTransferExcess > 0 ? "Can't be done" : 'Ready to use',
      detail: rejectedTransferExcess > 0
        ? `North Hub can receive at most ${warehouses.north.receivingLimitPerDay} cases per day. This transfer exceeds capacity by ${rejectedTransferExcess} cases.`
        : `This transfer fits within North Hub’s receiving limit of ${warehouses.north.receivingLimitPerDay} cases per day.`,
    },
  ]

  return { impact, plans }
}

const demoRehearsal = rehearseDistributor()
export const distributorImpact = demoRehearsal.impact
export const distributorRecoveryPlans = demoRehearsal.plans
