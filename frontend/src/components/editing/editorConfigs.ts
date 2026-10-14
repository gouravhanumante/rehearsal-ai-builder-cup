import type { Evidence, InboundShipment, LocationKind, Order, Supplier, SupplierOffer, Workspace } from '../../../../shared/planner/model'
import { pluralUnit, type Format } from '../../presentation/format'
import type { EditTarget } from '../../presentation/planText'

export type FieldType = 'integer' | 'money' | 'datetime' | 'text' | 'select' | 'multiselect'
export type FieldSpec = {
  key: string
  label: string
  type: FieldType
  required: boolean
  extractable: boolean
  /** False for choices the user owns (priority, a name, a location) — those need no proof. */
  isFact: boolean
  options?: { value: string; label: string }[]
  /** A short example shown under the label. */
  hint?: string
  /** Shown inside the empty box, e.g. an example value or "No limit (∞)". Defaults to "Unknown" for optional fields. */
  placeholder?: string
  /** Unit shown after the box, e.g. "packages" or "per day". */
  suffix?: string
}
export type ParsedValue = number | string | null

/** A multiselect keeps its choices as a JSON list in the form's text value. */
export const choicesOf = (raw: string): string[] => {
  try {
    const list: unknown = JSON.parse(raw || '[]')
    return Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : []
  } catch {
    return []
  }
}

export type EditorConfig = {
  title: string
  subtitle: string
  documentHint: string
  /** Creates a record rather than editing one, so the review lists every detail instead of before → after. */
  isNew?: boolean
  fields: FieldSpec[]
  initial: Record<string, string>
  initialEvidence: Record<string, Evidence | null>
  /** A rule that spans several fields (e.g. a transfer cannot go from a place to itself). Returns a message, or null if fine. */
  validate?: (values: Record<string, ParsedValue>) => string | null
  apply: (values: Record<string, ParsedValue>, evidence: Record<string, Evidence | null>) => Workspace
}

/** Turns what the user typed into a value, or an error message. Blank optional fields mean "unknown". */
export function parseField(field: FieldSpec, raw: string, format: Format): { value: ParsedValue } | { error: string } {
  if (field.type === 'multiselect') {
    const chosen = choicesOf(raw).filter((value) => field.options?.some((option) => option.value === value))
    if (chosen.length === 0) return field.required ? { error: 'Choose at least one' } : { value: null }
    return { value: JSON.stringify(chosen) }
  }
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
  if (field.type === 'multiselect') return choicesOf(parsed.value as string).map((value) => field.options?.find((option) => option.value === value)?.label ?? value).join(', ')
  return String(parsed.value)
}

/** One evidence for a whole record: any typed-in field makes the record unverified. */
export function recordEvidence(evidence: (Evidence | null)[], fallback: Evidence) {
  const all = evidence.filter((item): item is Evidence => item !== null)
  return all.find((item) => item.kind === 'manual') ?? all.find((item) => item.kind === 'document' && item !== fallback) ?? fallback
}

const newId = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 8)}`
/** A short readable code (SH-4F2A) that is not already taken. */
const uniqueId = (prefix: string, taken: string[]) => {
  for (;;) {
    const id = `${prefix}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
    if (!taken.includes(id)) return id
  }
}
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)
const asNumber = (value: ParsedValue) => (typeof value === 'number' ? value : null)
const asText = (value: ParsedValue) => (typeof value === 'string' ? value : null)
const fact = <T,>(value: T | null, evidence: Evidence | null) => ({ value, evidence: value === null ? null : evidence })
const kindOptions: { value: LocationKind; label: string }[] = [
  { value: 'warehouse', label: 'Warehouse' }, { value: 'store', label: 'Store' }, { value: 'distribution-centre', label: 'Distribution centre' },
]
const priorityOptions = [{ value: 'protected', label: 'High priority' }, { value: 'standard', label: 'Standard' }]
const repeatOptions = [{ value: '', label: 'Doesn’t repeat' }, { value: '7', label: 'Every week' }, { value: '14', label: 'Every 2 weeks' }, { value: '28', label: 'Every 4 weeks' }]
export const repeatLabel = (days: number) => repeatOptions.find((option) => option.value === String(days))?.label ?? `Every ${days} days`

export function editorFor(target: EditTarget, workspace: Workspace, format: Format): EditorConfig | null {
  const productOptions = workspace.products.map((product) => ({ value: product.id, label: product.name }))
  const locationOptions = workspace.locations.map((location) => ({ value: location.id, label: location.name }))
  const unitOf = (productId: string) => workspace.products.find((product) => product.id === productId)?.unit ?? 'unit'
  const productName = (productId: string) => workspace.products.find((product) => product.id === productId)?.name ?? productId
  const locationName = (locationId: string) => workspace.locations.find((location) => location.id === locationId)?.name ?? locationId

  if (target.type === 'stock') {
    const record = workspace.stock.find((item) => item.locationId === target.locationId && item.productId === target.productId)
    const ownLimit = workspace.storageLimits?.find((item) => item.locationId === target.locationId && item.productId === target.productId)
    const unit = unitOf(target.productId)
    return {
      title: `Stock at ${locationName(target.locationId)}`,
      subtitle: productName(target.productId),
      documentHint: 'Stock count sheet or goods receipt',
      fields: [
        { key: 'available', label: `${capitalize(pluralUnit(unit, 2))} available`, type: 'integer', required: true, extractable: true, isFact: true, placeholder: 'e.g. 40', suffix: pluralUnit(unit, 2) },
        { key: 'storageLimit', label: `Most ${pluralUnit(unit, 2)} it can store here`, type: 'integer', required: false, extractable: false, isFact: false, placeholder: 'No limit (∞)', suffix: pluralUnit(unit, 2),
          hint: 'For this product at this location only. Leave blank for no limit.' },
      ],
      initial: { available: record ? String(record.available.value) : '', storageLimit: ownLimit ? String(ownLimit.limit) : '' },
      initialEvidence: { available: record?.available.evidence ?? null, storageLimit: null },
      apply: (values, evidence) => {
        const next = { locationId: target.locationId, productId: target.productId, available: { value: values.available as number, evidence: evidence.available as Evidence } }
        const limit = asNumber(values.storageLimit)
        const otherLimits = (workspace.storageLimits ?? []).filter((item) => item !== ownLimit)
        return {
          ...workspace,
          stock: record
            ? workspace.stock.map((item) => item === record ? next : item)
            : [...workspace.stock, next],
          storageLimits: limit === null ? otherLimits : [...otherLimits, { locationId: target.locationId, productId: target.productId, limit }],
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
        ...order.lines.map((line): FieldSpec => ({ key: lineKey(line.productId), label: `${productName(line.productId)} (${pluralUnit(unitOf(line.productId), 2)})`, type: 'integer', required: true, extractable: true, isFact: true })),
        { key: 'dueAt', label: `Due (${format.settings.timeZone})`, type: 'datetime', required: true, extractable: true, isFact: true },
        { key: 'locationId', label: 'Ships from', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        { key: 'priority', label: 'Priority', type: 'select', required: true, extractable: false, isFact: false, options: priorityOptions },
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
    const unit = unitOf(offer?.productId ?? '')
    const contactField: FieldSpec = { key: 'contact', label: 'Email or phone', type: 'text', required: false, extractable: false, isFact: false, placeholder: 'e.g. orders@supplier.in or +91 98200 12345', hint: 'Used to send them a request when you are short.' }
    return {
      title: isNew ? 'Add supplier' : `Reply from ${supplier.name}`,
      subtitle: isNew ? 'Someone you could buy from in a shortage. You ask them for stock when a delay happens.' : `${productName(offer?.productId ?? '')} to ${locationName(offer?.locationId ?? '')} · blank means they haven’t said`,
      documentHint: 'Their reply, quote, pro-forma invoice, or delivery confirmation',
      isNew,
      fields: isNew ? [
        { key: 'name', label: 'Supplier name', type: 'text', required: true, extractable: false, isFact: false, placeholder: 'e.g. Vibgyor Mines' },
        contactField,
        { key: 'productIds', label: 'Products they can supply', type: 'multiselect', required: true, extractable: false, isFact: false, options: productOptions, hint: 'Tick every product you could buy from them.' },
        { key: 'locationId', label: 'Deliver to', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
      ] : [
        { key: 'name', label: 'Supplier name', type: 'text', required: true, extractable: true, isFact: false },
        contactField,
        { key: 'available', label: `How many ${pluralUnit(unit, 2)} they can send`, type: 'integer', required: false, extractable: true, isFact: true, suffix: pluralUnit(unit, 2) },
        { key: 'pricePerUnit', label: `Their price per ${unit} (${format.currencySymbol})`, type: 'money', required: false, extractable: true, isFact: true, suffix: `per ${unit}` },
        { key: 'arrivalAt', label: `When it would arrive (${format.settings.timeZone})`, type: 'datetime', required: false, extractable: true, isFact: true },
      ],
      initial: {
        name: supplier?.name ?? '',
        contact: supplier?.contact ?? '',
        productIds: JSON.stringify([(target.type === 'new-supplier' ? target.productId : undefined) ?? firstGroup?.lines[0]?.productId ?? workspace.products[0]?.id].filter(Boolean)),
        locationId: offer?.locationId ?? (target.type === 'new-supplier' ? target.locationId : undefined) ?? firstGroup?.locationId ?? workspace.locations[0]?.id ?? '',
        available: offer?.available.value?.toString() ?? '',
        pricePerUnit: offer?.pricePerUnit.value?.toString() ?? '',
        arrivalAt: offer?.arrivalAt.value ? format.toInput(offer.arrivalAt.value) : '',
      },
      initialEvidence: {
        name: null, contact: null, productIds: null, locationId: null,
        available: offer?.available.evidence ?? null,
        pricePerUnit: offer?.pricePerUnit.evidence ?? null,
        arrivalAt: offer?.arrivalAt.evidence ?? null,
      },
      apply: (values, evidence) => {
        if (isNew) {
          const offers: SupplierOffer[] = choicesOf(values.productIds as string).map((productId) => ({
            productId, locationId: values.locationId as string, available: fact(null, null), pricePerUnit: fact(null, null), arrivalAt: fact(null, null),
          }))
          const created: Supplier = { id: newId('supplier'), name: values.name as string, contact: asText(values.contact), offers }
          return { ...workspace, suppliers: [...workspace.suppliers, created] }
        }
        const nextOffer: SupplierOffer = {
          productId: offer!.productId,
          locationId: offer!.locationId,
          available: fact(asNumber(values.available), evidence.available),
          pricePerUnit: fact(asNumber(values.pricePerUnit), evidence.pricePerUnit),
          arrivalAt: fact(asText(values.arrivalAt), evidence.arrivalAt),
        }
        const updated: Supplier = { ...supplier, name: values.name as string, contact: asText(values.contact), offers: supplier.offers.map((item) => item === offer ? nextOffer : item) }
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

  if (target.type === 'new-order') {
    return {
      title: 'Add order',
      subtitle: 'A customer order you have promised to deliver',
      documentHint: 'Purchase order or order confirmation',
      isNew: true,
      fields: [
        { key: 'customer', label: 'Customer', type: 'text', required: true, extractable: true, isFact: true, placeholder: 'e.g. Shiva Kirana' },
        { key: 'productId', label: 'Product', type: 'select', required: true, extractable: false, isFact: false, options: productOptions },
        { key: 'quantity', label: 'Quantity', type: 'integer', required: true, extractable: true, isFact: true, placeholder: 'e.g. 20', suffix: 'packages' },
        { key: 'dueAt', label: `Due (${format.settings.timeZone})`, type: 'datetime', required: true, extractable: true, isFact: true },
        { key: 'locationId', label: 'Ships from', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        { key: 'priority', label: 'Priority', type: 'select', required: true, extractable: false, isFact: false, options: priorityOptions },
      ],
      initial: { customer: '', productId: workspace.products[0]?.id ?? '', quantity: '', dueAt: '', locationId: workspace.locations[0]?.id ?? '', priority: 'standard' },
      initialEvidence: { customer: null, productId: null, quantity: null, dueAt: null, locationId: null, priority: null },
      apply: (values, evidence) => {
        const order: Order = {
          id: uniqueId('ORD', workspace.orders.map((item) => item.id)),
          customer: values.customer as string,
          locationId: values.locationId as string,
          dueAt: values.dueAt as string,
          priority: values.priority as Order['priority'],
          lines: [{ productId: values.productId as string, quantity: values.quantity as number }],
          evidence: recordEvidence([evidence.customer, evidence.quantity, evidence.dueAt], evidence.dueAt as Evidence),
        }
        return { ...workspace, orders: [...workspace.orders, order] }
      },
    }
  }

  if (target.type === 'new-shipment') {
    return {
      title: 'Add incoming delivery',
      subtitle: 'Stock a supplier is sending you, once or on a schedule',
      documentHint: 'Dispatch note, invoice or delivery confirmation',
      isNew: true,
      fields: [
        { key: 'supplierName', label: 'Supplier', type: 'text', required: true, extractable: true, isFact: false, placeholder: 'e.g. Vibgyor Mines' },
        { key: 'productId', label: 'Product', type: 'select', required: true, extractable: false, isFact: false, options: productOptions },
        { key: 'quantity', label: 'Packages', type: 'integer', required: true, extractable: true, isFact: true, placeholder: 'e.g. 50', suffix: 'packages' },
        { key: 'locationId', label: 'Arriving at', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        { key: 'arrivalAt', label: `Arrives (${format.settings.timeZone})`, type: 'datetime', required: true, extractable: true, isFact: true, hint: 'If it repeats, this is the first delivery.' },
        { key: 'repeat', label: 'Repeats', type: 'select', required: false, extractable: false, isFact: false, options: repeatOptions,
          hint: 'For a regular delivery, the same amount arrives on this schedule. Orders count each one.' },
      ],
      initial: { supplierName: '', productId: target.productId ?? workspace.products[0]?.id ?? '', quantity: '', locationId: target.locationId ?? workspace.locations[0]?.id ?? '', arrivalAt: '', repeat: '' },
      initialEvidence: { supplierName: null, productId: null, quantity: null, locationId: null, arrivalAt: null, repeat: null },
      apply: (values, evidence) => {
        const proof = recordEvidence([evidence.quantity, evidence.arrivalAt], evidence.arrivalAt as Evidence)
        const shipment: InboundShipment = {
          id: uniqueId('SH', workspace.shipments.map((item) => item.id)),
          supplierName: values.supplierName as string,
          locationId: values.locationId as string,
          lines: [{ productId: values.productId as string, quantity: values.quantity as number }],
          originalArrivalAt: values.arrivalAt as string,
          confirmedArrivalAt: values.arrivalAt as string,
          updateSource: proof.source,
          evidence: proof,
          ...(values.repeat ? { repeatEveryDays: Number(values.repeat) } : {}),
        }
        return { ...workspace, shipments: [...workspace.shipments, shipment] }
      },
    }
  }

  if (target.type === 'report-delay') {
    const preselected = workspace.shipments.find((item) => item.id === target.shipmentId)
    const describe = (shipment: InboundShipment) => `${shipment.id} · ${shipment.supplierName} · ${shipment.lines.map((line) => productName(line.productId)).join(', ')} to ${locationName(shipment.locationId)}, `
      + (shipment.repeatEveryDays ? `next delivery ${format.dateTime(shipment.confirmedArrivalAt)} (${repeatLabel(shipment.repeatEveryDays).toLowerCase()})` : `due ${format.dateTime(shipment.originalArrivalAt)}`)
    return {
      title: 'Report a delay',
      subtitle: 'Which delivery is late, and when will it now arrive? For a regular delivery, only the next one moves.',
      documentHint: 'Supplier message, email or delivery update',
      fields: [
        { key: 'shipmentId', label: 'Shipment', type: 'select', required: true, extractable: false, isFact: false, options: workspace.shipments.map((shipment) => ({ value: shipment.id, label: describe(shipment) })) },
        { key: 'arrivalAt', label: `New arrival (${format.settings.timeZone})`, type: 'datetime', required: true, extractable: true, isFact: true },
        { key: 'updateSource', label: 'Who told you?', type: 'text', required: false, extractable: false, isFact: false, placeholder: 'e.g. a call with the supplier' },
      ],
      initial: { shipmentId: preselected?.id ?? workspace.shipments[0]?.id ?? '', arrivalAt: '', updateSource: '' },
      initialEvidence: { shipmentId: null, arrivalAt: null, updateSource: null },
      apply: (values, evidence) => {
        const shipmentId = values.shipmentId as string
        const proof = evidence.arrivalAt as Evidence
        const shipments = workspace.shipments.map((shipment) => shipment.id === shipmentId
          ? { ...shipment, confirmedArrivalAt: values.arrivalAt as string, updateSource: (values.updateSource as string | null) ?? proof.source, evidence: proof }
          : shipment)
        const alreadyReported = workspace.disruptions.some((disruption) => disruption.shipmentId === shipmentId)
        const disruptions = alreadyReported
          ? workspace.disruptions
          : [...workspace.disruptions, { id: uniqueId('INC', workspace.disruptions.map((item) => item.id)), kind: 'shipment-delay' as const, shipmentId }]
        return { ...workspace, shipments, disruptions }
      },
    }
  }

  if (target.type === 'new-route') {
    return {
      title: 'Add transfer route',
      subtitle: 'Moving stock from one of your locations to another',
      documentHint: 'Carrier booking or dispatch confirmation',
      isNew: true,
      fields: [
        { key: 'fromLocationId', label: 'Move from', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        { key: 'toLocationId', label: 'Move to', type: 'select', required: true, extractable: false, isFact: false, options: locationOptions },
        { key: 'arrivalAt', label: `Arrival if booked now (${format.settings.timeZone})`, type: 'datetime', required: false, extractable: true, isFact: true },
      ],
      initial: { fromLocationId: target.fromLocationId ?? workspace.locations[0]?.id ?? '', toLocationId: target.toLocationId ?? workspace.locations[1]?.id ?? '', arrivalAt: '' },
      initialEvidence: { fromLocationId: null, toLocationId: null, arrivalAt: null },
      validate: (values) => values.fromLocationId === values.toLocationId ? 'A transfer needs two different locations.' : null,
      apply: (values, evidence) => ({
        ...workspace,
        routes: [...workspace.routes, {
          id: uniqueId('route', workspace.routes.map((item) => item.id)),
          fromLocationId: values.fromLocationId as string,
          toLocationId: values.toLocationId as string,
          arrivalAt: fact(asText(values.arrivalAt), evidence.arrivalAt),
          quotes: [],
        }],
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
      isNew: !location,
      fields: [
        { key: 'name', label: 'Name', type: 'text', required: true, extractable: false, isFact: false, placeholder: 'e.g. Warehouse A' },
        { key: 'kind', label: 'Type', type: 'select', required: true, extractable: false, isFact: false, options: kindOptions },
        { key: 'receivingLimitPerDay', label: 'Most it can unload per day', type: 'integer', required: false, extractable: false, isFact: false, placeholder: 'No limit (∞)', suffix: 'per day', hint: 'Caps transfers from another location per day. It does not limit supplier deliveries. Leave blank for no limit.' },
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
    isNew: !product,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true, extractable: false, isFact: false, placeholder: 'e.g. Red pen or Teddy bear' },
      { key: 'perPackage', label: 'Items in one package', type: 'integer', required: true, extractable: false, isFact: false, placeholder: 'e.g. 10', suffix: 'items',
        hint: 'A package is how it is shipped: a box, packet or bag. Enter 1 if each item ships on its own. Stock counts and orders are in packages.' },
    ],
    initial: { name: product?.name ?? '', perPackage: product?.perPackage?.toString() ?? '' },
    initialEvidence: { name: null, perPackage: null },
    validate: (values) => (typeof values.perPackage === 'number' && values.perPackage < 1 ? 'A package holds at least 1 item.' : null),
    apply: (values) => {
      const unit = product?.unit ?? 'package'
      const perPackage = values.perPackage as number
      const next = { id: product?.id ?? newId('product'), name: values.name as string, unit, perPackage, pack: `${perPackage} per ${unit}` }
      return {
        ...workspace,
        products: product ? workspace.products.map((item) => item.id === product.id ? next : item) : [...workspace.products, next],
      }
    },
  }
}
