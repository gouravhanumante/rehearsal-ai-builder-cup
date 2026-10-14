import type { Evidence, LocationKind, Order, Supplier, SupplierOffer, Workspace } from '../../../../shared/planner/model'
import type { Format } from '../../presentation/format'
import type { EditTarget } from '../../presentation/planText'

export type FieldType = 'integer' | 'money' | 'datetime' | 'text' | 'select'
export type FieldSpec = {
  key: string
  label: string
  type: FieldType
  required: boolean
  extractable: boolean
  /** False for choices the user owns (priority, a name, a location) — those need no proof. */
  isFact: boolean
  options?: { value: string; label: string }[]
}
export type ParsedValue = number | string | null

export type EditorConfig = {
  title: string
  subtitle: string
  documentHint: string
  fields: FieldSpec[]
  initial: Record<string, string>
  initialEvidence: Record<string, Evidence | null>
  apply: (values: Record<string, ParsedValue>, evidence: Record<string, Evidence | null>) => Workspace
}

/** Turns what the user typed into a value, or an error message. Blank optional fields mean "unknown". */
export function parseField(field: FieldSpec, raw: string, format: Format): { value: ParsedValue } | { error: string } {
  const text = raw.trim()
  if (!text) return field.required ? { error: 'Required' } : { value: null }
  switch (field.type) {
    case 'integer':
      return /^\d{1,7}$/.test(text) ? { value: Number(text) } : { error: 'Enter a whole number' }
    case 'money':
      return /^\d{1,9}(\.\d{1,2})?$/.test(text) ? { value: Number(text) } : { error: 'Enter an amount like 12.50' }
    case 'datetime': {
      const iso = format.fromInput(text)
      return iso ? { value: iso } : { error: 'Pick a date and time' }
    }
    case 'select':
      return field.options?.some((option) => option.value === text) ? { value: text } : { error: 'Choose one' }
    case 'text':
      return text.length <= 80 ? { value: text } : { error: 'Keep this under 80 characters' }
  }
}

export function displayValue(field: FieldSpec, raw: string, format: Format) {
  const parsed = parseField(field, raw, format)
  if ('error' in parsed || parsed.value === null) return 'Unknown'
  if (field.type === 'datetime') return format.dateTime(parsed.value as string)
  if (field.type === 'money') return format.money(parsed.value as number)
  if (field.type === 'integer') return format.number(parsed.value as number)
  if (field.type === 'select') return field.options?.find((option) => option.value === parsed.value)?.label ?? String(parsed.value)
  return String(parsed.value)
}

/** One evidence for a whole record: any typed-in field makes the record unverified. */
export function recordEvidence(evidence: (Evidence | null)[], fallback: Evidence) {
  const all = evidence.filter((item): item is Evidence => item !== null)
  return all.find((item) => item.kind === 'manual') ?? all.find((item) => item.kind === 'document' && item !== fallback) ?? fallback
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
const asNumber = (value: ParsedValue) => (typeof value === 'number' ? value : null)
const asText = (value: ParsedValue) => (typeof value === 'string' ? value : null)
const fact = <T,>(value: T | null, evidence: Evidence | null) => ({ value, evidence: value === null ? null : evidence })
const kindOptions: { value: LocationKind; label: string }[] = [
  { value: 'warehouse', label: 'Warehouse' }, { value: 'store', label: 'Store' }, { value: 'distribution-centre', label: 'Distribution centre' },
]

export function editorFor(target: EditTarget, workspace: Workspace, format: Format): EditorConfig | null {
  const productOptions = workspace.products.map((product) => ({ value: product.id, label: product.name }))
  const locationOptions = workspace.locations.map((location) => ({ value: location.id, label: location.name }))
  const unitOf = (productId: string) => workspace.products.find((product) => product.id === productId)?.unit ?? 'unit'
  const productName = (productId: string) => workspace.products.find((product) => product.id === productId)?.name ?? productId
  const locationName = (locationId: string) => workspace.locations.find((location) => location.id === locationId)?.name ?? locationId
  const priceLabel = `Price per unit (${format.currencySymbol})`

  if (target.type === 'stock') {
    const record = workspace.stock.find((item) => item.locationId === target.locationId && item.productId === target.productId)
    return {
      title: `Stock at ${locationName(target.locationId)}`,
      subtitle: productName(target.productId),
      documentHint: 'Stock count sheet or goods receipt',
      fields: [{ key: 'available', label: `${unitOf(target.productId)}s available`, type: 'integer', required: true, extractable: true, isFact: true }],
      initial: { available: record ? String(record.available.value) : '' },
      initialEvidence: { available: record?.available.evidence ?? null },
      apply: (values, evidence) => {
        const next = { locationId: target.locationId, productId: target.productId, available: { value: values.available as number, evidence: evidence.available as Evidence } }
        return {
          ...workspace,
          stock: record
            ? workspace.stock.map((item) => item === record ? next : item)
            : [...workspace.stock, next],
        }
      },
    }
  }

  if (target.type === 'order') {
    const order = workspace.orders.find((item) => item.id === target.orderId)
    if (!order) return null
    const lineKey = (productId: string) => `line:${productId}`
    return {
      title: `Edit ${order.id}`,
      subtitle: order.customer,
      documentHint: 'Purchase order or order confirmation',
      fields: [
        { key: 'customer', label: 'Customer', type: 'text', required: true, extractable: true, isFact: true },
        ...order.lines.map((line): FieldSpec => ({ key: lineKey(line.productId), label: `${productName(line.productId)} (${unitOf(line.productId)}s)`, type: 'integer', required: true, extractable: true, isFact: true })),
        { key: 'dueAt', label: `Due (${format.settings.timeZone})`, type: 'datetime', required: true, extractable: true, isFact: true },
        { key: 'locationId', label: 'Ships from', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        { key: 'priority', label: 'Priority', type: 'select', required: true, extractable: false, isFact: false, options: [{ value: 'protected', label: 'Priority' }, { value: 'standard', label: 'Standard' }] },
      ],
      initial: {
        customer: order.customer, dueAt: format.toInput(order.dueAt), locationId: order.locationId, priority: order.priority,
        ...Object.fromEntries(order.lines.map((line) => [lineKey(line.productId), String(line.quantity)])),
      },
      initialEvidence: {
        customer: order.evidence, dueAt: order.evidence, locationId: null, priority: null,
        ...Object.fromEntries(order.lines.map((line) => [lineKey(line.productId), order.evidence])),
      },
      apply: (values, evidence) => {
        const next: Order = {
          ...order,
          customer: values.customer as string,
          dueAt: values.dueAt as string,
          locationId: values.locationId as string,
          priority: values.priority as Order['priority'],
          lines: order.lines.map((line) => ({ ...line, quantity: values[lineKey(line.productId)] as number })),
          evidence: recordEvidence([evidence.customer, evidence.dueAt, ...order.lines.map((line) => evidence[lineKey(line.productId)])], order.evidence),
        }
        return { ...workspace, orders: workspace.orders.map((item) => item.id === order.id ? next : item) }
      },
    }
  }

  if (target.type === 'offer' || target.type === 'new-supplier') {
    const supplier = target.type === 'offer' ? workspace.suppliers.find((item) => item.id === target.supplierId) : undefined
    const offer = target.type === 'offer' ? supplier?.offers[target.offerIndex] : undefined
    if (target.type === 'offer' && (!supplier || !offer)) return null
    const firstGroup = workspace.disruptions.length ? workspace.shipments.find((item) => item.id === workspace.disruptions[0].shipmentId) : undefined
    const isNew = !supplier
    return {
      title: isNew ? 'Add supplier' : `Supplier details · ${supplier.name}`,
      subtitle: isNew ? 'Leave anything you don’t know yet blank — it stays “Unknown”.' : `${productName(offer?.productId ?? '')} to ${locationName(offer?.locationId ?? '')} · blank means unknown`,
      documentHint: 'Supplier quote, pro-forma invoice, or delivery confirmation',
      fields: [
        { key: 'name', label: 'Supplier name', type: 'text', required: true, extractable: true, isFact: false },
        ...(isNew ? [
          { key: 'productId', label: 'Product', type: 'select', required: true, extractable: false, isFact: false, options: productOptions },
          { key: 'locationId', label: 'Deliver to', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        ] satisfies FieldSpec[] : []),
        { key: 'available', label: 'Stock available', type: 'integer', required: false, extractable: true, isFact: true },
        { key: 'pricePerUnit', label: priceLabel, type: 'money', required: false, extractable: true, isFact: true },
        { key: 'arrivalAt', label: `Arrival (${format.settings.timeZone})`, type: 'datetime', required: false, extractable: true, isFact: true },
      ],
      initial: {
        name: supplier?.name ?? '',
        productId: offer?.productId ?? firstGroup?.lines[0]?.productId ?? workspace.products[0]?.id ?? '',
        locationId: offer?.locationId ?? firstGroup?.locationId ?? workspace.locations[0]?.id ?? '',
        available: offer?.available.value?.toString() ?? '',
        pricePerUnit: offer?.pricePerUnit.value?.toString() ?? '',
        arrivalAt: offer?.arrivalAt.value ? format.toInput(offer.arrivalAt.value) : '',
      },
      initialEvidence: {
        name: null, productId: null, locationId: null,
        available: offer?.available.evidence ?? null,
        pricePerUnit: offer?.pricePerUnit.evidence ?? null,
        arrivalAt: offer?.arrivalAt.evidence ?? null,
      },
      apply: (values, evidence) => {
        const nextOffer: SupplierOffer = {
          productId: offer?.productId ?? (values.productId as string),
          locationId: offer?.locationId ?? (values.locationId as string),
          available: fact(asNumber(values.available), evidence.available),
          pricePerUnit: fact(asNumber(values.pricePerUnit), evidence.pricePerUnit),
          arrivalAt: fact(asText(values.arrivalAt), evidence.arrivalAt),
        }
        if (isNew) {
          const created: Supplier = { id: newId('supplier'), name: values.name as string, offers: [nextOffer] }
          return { ...workspace, suppliers: [...workspace.suppliers, created] }
        }
        const updated: Supplier = { ...supplier, name: values.name as string, offers: supplier.offers.map((item) => item === offer ? nextOffer : item) }
        return { ...workspace, suppliers: workspace.suppliers.map((item) => item.id === supplier.id ? updated : item) }
      },
    }
  }

  if (target.type === 'route') {
    const route = workspace.routes.find((item) => item.id === target.routeId)
    if (!route) return null
    return {
      title: `Transfer ${locationName(route.fromLocationId)} → ${locationName(route.toLocationId)}`,
      subtitle: 'When would a transfer booked now arrive? Blank means unknown.',
      documentHint: 'Carrier booking or dispatch confirmation',
      fields: [{ key: 'arrivalAt', label: `Arrival (${format.settings.timeZone})`, type: 'datetime', required: false, extractable: true, isFact: true }],
      initial: { arrivalAt: route.arrivalAt.value ? format.toInput(route.arrivalAt.value) : '' },
      initialEvidence: { arrivalAt: route.arrivalAt.evidence },
      apply: (values, evidence) => ({
        ...workspace,
        routes: workspace.routes.map((item) => item.id === route.id ? { ...item, arrivalAt: fact(asText(values.arrivalAt), evidence.arrivalAt) } : item),
      }),
    }
  }

  if (target.type === 'location' || target.type === 'new-location') {
    const location = target.type === 'location' ? workspace.locations.find((item) => item.id === target.locationId) : undefined
    if (target.type === 'location' && !location) return null
    return {
      title: location ? `Edit ${location.name}` : 'Add location',
      subtitle: 'A warehouse, store, or distribution centre',
      documentHint: 'Site details',
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true, extractable: false, isFact: false },
        { key: 'kind', label: 'Type', type: 'select', required: true, extractable: false, isFact: false, options: kindOptions },
        { key: 'receivingLimitPerDay', label: 'Most units it can receive per day (blank = no limit)', type: 'integer', required: false, extractable: false, isFact: false },
      ],
      initial: { name: location?.name ?? '', kind: location?.kind ?? 'store', receivingLimitPerDay: location?.receivingLimitPerDay?.toString() ?? '' },
      initialEvidence: { name: null, kind: null, receivingLimitPerDay: null },
      apply: (values) => {
        const next = { id: location?.id ?? newId('location'), name: values.name as string, kind: values.kind as LocationKind, receivingLimitPerDay: asNumber(values.receivingLimitPerDay) }
        return {
          ...workspace,
          locations: location ? workspace.locations.map((item) => item.id === location.id ? next : item) : [...workspace.locations, next],
        }
      },
    }
  }

  const product = target.type === 'product' ? workspace.products.find((item) => item.id === target.productId) : undefined
  if (target.type === 'product' && !product) return null
  return {
    title: product ? `Edit ${product.name}` : 'Add product',
    subtitle: 'Something you stock and sell',
    documentHint: 'Product sheet',
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, extractable: false, isFact: false },
      { key: 'pack', label: 'Pack (e.g. 1 kg case)', type: 'text', required: true, extractable: false, isFact: false },
      { key: 'unit', label: 'Counted in (e.g. case)', type: 'text', required: true, extractable: false, isFact: false },
    ],
    initial: { name: product?.name ?? '', pack: product?.pack ?? '', unit: product?.unit ?? 'case' },
    initialEvidence: { name: null, pack: null, unit: null },
    apply: (values) => {
      const next = { id: product?.id ?? newId('product'), name: values.name as string, pack: values.pack as string, unit: values.unit as string }
      return {
        ...workspace,
        products: product ? workspace.products.map((item) => item.id === product.id ? next : item) : [...workspace.products, next],
      }
    },
  }
}
