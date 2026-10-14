import type { Workspace } from '../../../shared/planner/model'
import { sampleWorkspace } from '../../../shared/planner/sample'
import { parseWorkspace } from '../../../shared/planner/validate'

const STORAGE_KEY = 'rehearsal.demo.v2'
const LEGACY_KEY = 'rehearsal.demo.v1'

type LegacyEvidence = Workspace['orders'][number]['evidence']
type LegacyFact<T> = { value: T | null; evidence: LegacyEvidence | null }
type LegacyDemo = {
  version: 1
  inventory: { northCases: { value: number; evidence: LegacyEvidence }; southUnallocatedCases: { value: number; evidence: LegacyEvidence } }
  orders: { id: string; customer: string; dueAt: string; cases: number; priority: 'protected' | 'standard'; evidence: LegacyEvidence }[]
  suppliers: { id: string; name: string; availableCases: LegacyFact<number>; pricePerCase: LegacyFact<number>; arrivalAt: LegacyFact<string> }[]
}

/** Edits saved by the first version (one product, North and South Hub) carried into the new shape. */
export function migrateV1(raw: unknown): Workspace | null {
  const legacy = raw as LegacyDemo
  if (legacy?.version !== 1 || !legacy.inventory || !Array.isArray(legacy.orders) || !Array.isArray(legacy.suppliers)) return null
  const productId = sampleWorkspace.products[0].id
  const candidate: Workspace = {
    ...sampleWorkspace,
    stock: [
      { locationId: 'north', productId, available: legacy.inventory.northCases },
      { locationId: 'south', productId, available: legacy.inventory.southUnallocatedCases },
    ],
    orders: legacy.orders.map((order) => ({
      id: order.id, customer: order.customer, locationId: 'north', dueAt: order.dueAt, priority: order.priority,
      lines: [{ productId, quantity: order.cases }], evidence: order.evidence,
    })),
    suppliers: legacy.suppliers.map((supplier) => ({
      id: supplier.id,
      name: supplier.name,
      offers: [{ productId, locationId: 'north', available: supplier.availableCases, pricePerUnit: supplier.pricePerCase, arrivalAt: supplier.arrivalAt }],
    })),
  }
  return parseWorkspace(candidate)
}

export type LoadResult = { workspace: Workspace; notice: string | null }

/** Saved edits come from browser storage, so check them; never drop them without saying so. */
export function readSaved(current: string | null, legacy: string | null): LoadResult {
  const parse = (raw: string) => { try { return JSON.parse(raw) as unknown } catch { return undefined } }
  if (current) {
    const workspace = parseWorkspace(parse(current))
    if (workspace) return { workspace, notice: null }
    return { workspace: sampleWorkspace, notice: 'Your saved edits could not be read, so the sample data was loaded instead.' }
  }
  if (legacy) {
    const workspace = migrateV1(parse(legacy))
    if (workspace) return { workspace, notice: 'Your saved edits were moved to the new format.' }
    return { workspace: sampleWorkspace, notice: 'Your earlier saved edits could not be carried over, so the sample data was loaded instead.' }
  }
  return { workspace: sampleWorkspace, notice: null }
}

export function loadDemo(): LoadResult {
  const result = readSaved(localStorage.getItem(STORAGE_KEY), localStorage.getItem(LEGACY_KEY))
  if (result.notice && result.workspace !== sampleWorkspace) saveDemo(result.workspace)
  return result
}

export function saveDemo(workspace: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
  localStorage.removeItem(LEGACY_KEY)
}

export function clearDemo() {
  localStorage.removeItem(STORAGE_KEY)
  localStorage.removeItem(LEGACY_KEY)
}

/** Another tab saved or reset; hand back what is now stored so this tab does not overwrite it. */
export function onDemoChangedElsewhere(apply: (workspace: Workspace) => void) {
  const handle = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) apply(readSaved(event.newValue, null).workspace)
  }
  window.addEventListener('storage', handle)
  return () => window.removeEventListener('storage', handle)
}
