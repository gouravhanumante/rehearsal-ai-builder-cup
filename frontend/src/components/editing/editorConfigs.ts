import type { AlternativeSupplier, DemoOrder, DistributorData, Evidence } from '../../data/distributorDemo'
import { formatDateTime, fromIstInput, toIstInput } from '../../lib/istTime'

export type FieldType = 'integer' | 'money' | 'datetime' | 'text' | 'priority'
export type FieldSpec = { key: string; label: string; type: FieldType; required: boolean; extractable: boolean; /** False for choices the user owns (priority, a name) — those need no proof. */ isFact: boolean }
export type ParsedValue = number | string | null

export type EditTarget =
  | { type: 'inventory' }
  | { type: 'order'; orderId: string }
  | { type: 'supplier'; supplierId: string }
  | { type: 'new-supplier' }

export type EditorConfig = {
  title: string
  subtitle: string
  documentHint: string
  fields: FieldSpec[]
  initial: Record<string, string>
  initialEvidence: Record<string, Evidence | null>
  apply: (values: Record<string, ParsedValue>, evidence: Record<string, Evidence | null>) => DistributorData
}

/** Turns what the user typed into a value, or an error message. Blank optional fields mean "unknown". */
export function parseField(field: FieldSpec, raw: string): { value: ParsedValue } | { error: string } {
  const text = raw.trim()
  if (!text) return field.required ? { error: 'Required' } : { value: null }
  switch (field.type) {
    case 'integer':
      return /^\d{1,6}$/.test(text) ? { value: Number(text) } : { error: 'Enter a whole number of cases' }
    case 'money':
      return /^\d{1,7}(\.\d{1,2})?$/.test(text) ? { value: Number(text) } : { error: 'Enter an amount like 12.50' }
    case 'datetime': {
      const iso = fromIstInput(text)
      return iso ? { value: iso } : { error: 'Pick a date and time' }
    }
    case 'priority':
      return text === 'protected' || text === 'standard' ? { value: text } : { error: 'Choose a priority' }
    case 'text':
      return text.length <= 80 ? { value: text } : { error: 'Keep this under 80 characters' }
  }
}

export function displayValue(field: FieldSpec, raw: string) {
  const parsed = parseField(field, raw)
  if ('error' in parsed || parsed.value === null) return 'Unknown'
  if (field.type === 'datetime') return formatDateTime(parsed.value as string)
  if (field.type === 'money') return `$${parsed.value}`
  if (field.type === 'integer') return `${parsed.value} cases`
  if (field.type === 'priority') return parsed.value === 'protected' ? 'Priority' : 'Standard'
  return String(parsed.value)
}

/** One evidence for a whole record: any typed-in field makes the record unverified. */
function recordEvidence(evidence: Record<string, Evidence | null>, fallback: Evidence) {
  const all = Object.values(evidence).filter((item): item is Evidence => item !== null)
  return all.find((item) => item.kind === 'manual') ?? all.find((item) => item.kind === 'document' && item !== fallback) ?? fallback
}

const numberOrNull = (value: ParsedValue) => (typeof value === 'number' ? value : null)
const stringOrNull = (value: ParsedValue) => (typeof value === 'string' ? value : null)

function inventoryEditor(data: DistributorData): EditorConfig {
  const { northCases, southUnallocatedCases } = data.inventory
  return {
    title: 'Edit stock counts',
    subtitle: `${data.product.name} · ${data.product.pack}`,
    documentHint: 'Stock count sheet or goods receipt',
    fields: [
      { key: 'northCases', label: `${data.warehouses.north.name} · cases on hand`, type: 'integer', required: true, extractable: true, isFact: true },
      { key: 'southCases', label: `${data.warehouses.south.name} · unallocated cases`, type: 'integer', required: true, extractable: true, isFact: true },
    ],
    initial: { northCases: String(northCases.value), southCases: String(southUnallocatedCases.value) },
    initialEvidence: { northCases: northCases.evidence, southCases: southUnallocatedCases.evidence },
    apply: (values, evidence) => ({
      ...data,
      inventory: {
        northCases: { value: values.northCases as number, evidence: evidence.northCases ?? northCases.evidence },
        southUnallocatedCases: { value: values.southCases as number, evidence: evidence.southCases ?? southUnallocatedCases.evidence },
      },
    }),
  }
}

function orderEditor(data: DistributorData, order: DemoOrder): EditorConfig {
  const evidence = { customer: order.evidence, cases: order.evidence, dueAt: order.evidence, priority: null }
  return {
    title: `Edit ${order.id}`,
    subtitle: order.customer,
    documentHint: 'Purchase order or order confirmation',
    fields: [
      { key: 'customer', label: 'Customer', type: 'text', required: true, extractable: true, isFact: true },
      { key: 'cases', label: 'Cases ordered', type: 'integer', required: true, extractable: true, isFact: true },
      { key: 'dueAt', label: 'Due (India time)', type: 'datetime', required: true, extractable: true, isFact: true },
      { key: 'priority', label: 'Priority', type: 'priority', required: true, extractable: false, isFact: false },
    ],
    initial: { customer: order.customer, cases: String(order.cases), dueAt: toIstInput(order.dueAt), priority: order.priority },
    initialEvidence: evidence,
    apply: (values, fieldEvidence) => ({
      ...data,
      orders: data.orders.map((item) => item.id !== order.id ? item : {
        ...item,
        customer: values.customer as string,
        cases: values.cases as number,
        dueAt: values.dueAt as string,
        priority: values.priority as DemoOrder['priority'],
        evidence: recordEvidence({ customer: fieldEvidence.customer, cases: fieldEvidence.cases, dueAt: fieldEvidence.dueAt }, order.evidence),
      }),
    }),
  }
}

function supplierEditor(data: DistributorData, supplier: AlternativeSupplier | null): EditorConfig {
  const isNew = supplier === null
  return {
    title: isNew ? 'Add supplier' : `Supplier details · ${supplier.name}`,
    subtitle: isNew ? 'Leave anything you don’t know yet blank — it stays “Unknown”.' : 'Blank means unknown. Unknown is never treated as zero.',
    documentHint: 'Supplier quote, pro-forma invoice, or delivery confirmation',
    fields: [
      { key: 'name', label: 'Supplier name', type: 'text', required: true, extractable: true, isFact: false },
      { key: 'availableCases', label: 'Stock available (cases)', type: 'integer', required: false, extractable: true, isFact: true },
      { key: 'pricePerCase', label: 'Price per case ($)', type: 'money', required: false, extractable: true, isFact: true },
      { key: 'arrivalAt', label: 'Arrival at North Hub (India time)', type: 'datetime', required: false, extractable: true, isFact: true },
    ],
    initial: {
      name: supplier?.name ?? '',
      availableCases: supplier?.availableCases.value?.toString() ?? '',
      pricePerCase: supplier?.pricePerCase.value?.toString() ?? '',
      arrivalAt: supplier?.arrivalAt.value ? toIstInput(supplier.arrivalAt.value) : '',
    },
    initialEvidence: {
      name: null,
      availableCases: supplier?.availableCases.evidence ?? null,
      pricePerCase: supplier?.pricePerCase.evidence ?? null,
      arrivalAt: supplier?.arrivalAt.evidence ?? null,
    },
    apply: (values, evidence) => {
      const next: AlternativeSupplier = {
        id: supplier?.id ?? crypto.randomUUID().slice(0, 8),
        name: values.name as string,
        availableCases: { value: numberOrNull(values.availableCases), evidence: values.availableCases === null ? null : evidence.availableCases },
        pricePerCase: { value: numberOrNull(values.pricePerCase), evidence: values.pricePerCase === null ? null : evidence.pricePerCase },
        arrivalAt: { value: stringOrNull(values.arrivalAt), evidence: values.arrivalAt === null ? null : evidence.arrivalAt },
      }
      return {
        ...data,
        suppliers: isNew ? [...data.suppliers, next] : data.suppliers.map((item) => item.id === next.id ? next : item),
      }
    },
  }
}

export function editorFor(target: EditTarget, data: DistributorData): EditorConfig | null {
  if (target.type === 'inventory') return inventoryEditor(data)
  if (target.type === 'new-supplier') return supplierEditor(data, null)
  if (target.type === 'order') {
    const order = data.orders.find((item) => item.id === target.orderId)
    return order ? orderEditor(data, order) : null
  }
  const supplier = data.suppliers.find((item) => item.id === target.supplierId)
  return supplier ? supplierEditor(data, supplier) : null
}
