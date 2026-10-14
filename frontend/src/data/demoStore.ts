import { distributorDemo, type DistributorData } from './distributorDemo'

const STORAGE_KEY = 'rehearsal.demo.v1'

const isEvidence = (value: unknown) => {
  const evidence = value as { kind?: unknown; source?: unknown; recordedAt?: unknown } | null
  return typeof evidence === 'object' && evidence !== null
    && ['sample', 'manual', 'document'].includes(evidence.kind as string)
    && typeof evidence.source === 'string' && typeof evidence.recordedAt === 'string'
}

const isRecordedNumber = (value: unknown) => {
  const recorded = value as { value?: unknown; evidence?: unknown } | null
  return typeof recorded === 'object' && recorded !== null && Number.isFinite(recorded.value) && isEvidence(recorded.evidence)
}

const isFact = (value: unknown, type: 'number' | 'string') => {
  const fact = value as { value?: unknown; evidence?: unknown } | null
  if (typeof fact !== 'object' || fact === null) return false
  if (fact.value === null) return fact.evidence === null
  return typeof fact.value === type && isEvidence(fact.evidence)
}

/** Saved edits come from browser storage, so check their shape before trusting them. */
export function parseSavedDemo(raw: string | null): DistributorData | null {
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as DistributorData
    const valid = data?.version === 1
      && isRecordedNumber(data.inventory?.northCases)
      && isRecordedNumber(data.inventory?.southUnallocatedCases)
      && Array.isArray(data.orders)
      && data.orders.every((order) => typeof order.id === 'string' && typeof order.customer === 'string'
        && Number.isInteger(order.cases) && !Number.isNaN(Date.parse(order.dueAt))
        && ['protected', 'standard'].includes(order.priority) && isEvidence(order.evidence))
      && Array.isArray(data.suppliers)
      && data.suppliers.every((supplier) => typeof supplier.id === 'string' && typeof supplier.name === 'string'
        && isFact(supplier.availableCases, 'number') && isFact(supplier.pricePerCase, 'number') && isFact(supplier.arrivalAt, 'string'))
    return valid ? { ...distributorDemo, inventory: data.inventory, orders: data.orders, suppliers: data.suppliers } : null
  } catch {
    return null
  }
}

export function loadDemo(): DistributorData {
  return parseSavedDemo(localStorage.getItem(STORAGE_KEY)) ?? distributorDemo
}

export function saveDemo(data: DistributorData) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function clearDemo() {
  localStorage.removeItem(STORAGE_KEY)
}
