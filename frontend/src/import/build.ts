import { importKinds, type ImportField, type ImportKind } from '../../../shared/import/fields'
import type { Evidence, InboundShipment, Order, OrderLine, Product, Location, StockRecord, Workspace } from '../../../shared/planner/model'
import { LIMITS } from '../../../shared/planner/validate'
import { localToIso } from '../../../shared/planner/time'
import type { Mapping } from './match'
import type { Table } from './table'

export type DateOrder = 'dmy' | 'mdy'
export type RowProblem = { row: number; message: string }
export type ImportResult = {
  workspace: Workspace
  added: number
  updated: number
  unchanged: number
  newProducts: string[]
  newLocations: string[]
  problems: RowProblem[]
  notes: string[]
  /** Set when the file cannot be imported at all; the workspace is then untouched. */
  blocked: string | null
}

type Value = string | number
type Row = { row: number; values: Record<string, Value> }

const normalise = (text: string) => text.trim().toLowerCase().replace(/\s+/g, ' ')
const priorityWords = new Set(['priority', 'high', 'urgent', 'protected', 'vip', 'yes', 'y', 'true', '1'])
const FILE_ROW_OFFSET = 2 // the header is row 1

/** Day-first or month-first dates, or 2026-10-16; a date with no time means the end of that day. */
export function parseDate(text: string, order: DateOrder, timeZone: string): { iso: string; endOfDay: boolean } | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(text)
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::\d{2})?)?$/.exec(text)
  let year: number, month: number, day: number, time: [string | undefined, string | undefined]
  if (iso) { year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3]); time = [iso[4], iso[5]] }
  else if (local) {
    const first = Number(local[1]); const second = Number(local[2])
    year = Number(local[3]); time = [local[4], local[5]]
    ;[day, month] = order === 'dmy' ? [first, second] : [second, first]
  } else return null
  const hour = time[0] === undefined ? 23 : Number(time[0])
  const minute = time[1] === undefined ? 59 : Number(time[1])
  const calendar = new Date(Date.UTC(year, month - 1, day))
  if (calendar.getUTCFullYear() !== year || calendar.getUTCMonth() !== month - 1 || calendar.getUTCDate() !== day || hour > 23 || minute > 59) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  const result = localToIso(`${year}-${pad(month)}-${pad(day)}T${pad(hour)}:${pad(minute)}`, timeZone)
  return result ? { iso: result, endOfDay: time[0] === undefined } : null
}

export function parseQuantity(text: string, allowZero: boolean): number | null {
  const cleaned = text.replace(/\s/g, '')
  const plain = /^\d{1,7}$/.test(cleaned) ? cleaned : /^\d{1,3}(,\d{3})+$/.test(cleaned) ? cleaned.replace(/,/g, '') : null
  if (plain === null) return null
  const value = Number(plain)
  return value > 10_000_000 || (!allowZero && value === 0) ? null : value
}

const newCode = (prefix: string, taken: Set<string>) => {
  for (;;) {
    const code = `${prefix}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`
    if (!taken.has(code)) { taken.add(code); return code }
  }
}

/** Turns a table plus a column mapping into a changed workspace, without touching the original. */
export function buildImport(workspace: Workspace, kind: ImportKind, table: Table, mapping: Mapping, options: { dateOrder: DateOrder }, now = new Date()): ImportResult {
  const fields = importKinds[kind].fields
  const problems: RowProblem[] = []
  let endOfDayDates = 0
  const evidence: Evidence = { kind: 'import', source: table.fileName, recordedAt: now.toISOString() }

  const readCell = (cells: string[], field: ImportField) => {
    const column = mapping[field.key]
    return column === null || column === undefined ? '' : (cells[column] ?? '').trim()
  }

  const parseRow = (cells: string[]): Record<string, Value> | string => {
    const values: Record<string, Value> = {}
    for (const field of fields) {
      const text = readCell(cells, field)
      if (field.type === 'priority') { values[field.key] = priorityWords.has(normalise(text)) ? 'protected' : 'standard'; continue }
      if (!text) { if (field.required) return `${field.label} is empty`; continue }
      if (field.type === 'text') {
        if (text.length > (field.key === 'ref' ? 64 : 80)) return `${field.label} is too long`
        values[field.key] = text
      } else if (field.type === 'quantity') {
        const quantity = parseQuantity(text, kind === 'stock')
        if (quantity === null) return `${field.label} "${text}" is not a whole number${kind === 'stock' ? '' : ' above zero'}`
        values[field.key] = quantity
      } else {
        const date = parseDate(text, options.dateOrder, workspace.settings.timeZone)
        if (!date) return `${field.label} "${text}" is not a date I can read`
        if (date.endOfDay) endOfDayDates += 1
        values[field.key] = date.iso
      }
    }
    return values
  }

  // Names in the file are matched to what you already have; anything new is created, but only if a kept row uses it.
  const productByName = new Map(workspace.products.map((product) => [normalise(product.name), product]))
  const locationByName = new Map(workspace.locations.map((location) => [normalise(location.name), location]))
  const productCodes = new Set(workspace.products.map((product) => product.id))
  const locationCodes = new Set(workspace.locations.map((location) => location.id))
  const createdProducts = new Map<string, Product>()
  const createdLocations = new Map<string, Location>()
  const productFor = (name: string) => {
    const key = normalise(name)
    const found = productByName.get(key) ?? createdProducts.get(key)
    if (found) return found
    const created: Product = { id: newCode('product', productCodes), name, unit: 'unit', pack: 'unit' }
    createdProducts.set(key, created)
    return created
  }
  const locationFor = (name: string) => {
    const key = normalise(name)
    const found = locationByName.get(key) ?? createdLocations.get(key)
    if (found) return found
    const created: Location = { id: newCode('location', locationCodes), name, kind: 'store', receivingLimitPerDay: null }
    createdLocations.set(key, created)
    return created
  }

  const parsed: Row[] = []
  const refOf = (cells: string[]) => readCell(cells, fields.find((field) => field.key === 'ref') ?? fields[0]!)
  const failedRefs = new Set<string>()
  const notes: string[] = []
  table.rows.forEach((cells, index) => {
    const row = index + FILE_ROW_OFFSET
    const values = parseRow(cells)
    if (typeof values === 'string') {
      problems.push({ row, message: values })
      if (kind !== 'stock' && refOf(cells)) failedRefs.add(refOf(cells))
    } else parsed.push({ row, values })
  })

  const next: Workspace = { ...workspace }
  let added = 0, updated = 0, unchanged = 0
  const usedProducts = new Set<string>()
  const usedLocations = new Set<string>()
  const markUsed = (product: Product, location: Location) => { usedProducts.add(product.id); usedLocations.add(location.id) }

  if (kind === 'stock') {
    const byKey = new Map(workspace.stock.map((record) => [`${record.locationId}|${record.productId}`, record]))
    const seen = new Set<string>()
    for (const { row, values } of parsed) {
      const product = productFor(String(values.product))
      const location = locationFor(String(values.location))
      const key = `${location.id}|${product.id}`
      if (seen.has(key)) { problems.push({ row, message: `${location.name} / ${product.name} appears more than once; the first row was used` }); continue }
      seen.add(key)
      markUsed(product, location)
      const existing = byKey.get(key)
      if (existing?.available.value === values.quantity) { unchanged += 1; continue }
      byKey.set(key, { locationId: location.id, productId: product.id, available: { value: values.quantity as number, evidence } } satisfies StockRecord)
      if (existing) updated += 1; else added += 1
    }
    next.stock = [...byKey.values()]
  } else {
    // Rows with the same reference are lines of one record; a record with any bad row is left out whole, so a missing line never understates it.
    const groups = new Map<string, Row[]>()
    for (const item of parsed) {
      const ref = String(item.values.ref ?? '')
      const key = ref ? `ref:${ref}` : `row:${item.row}`
      groups.set(key, [...(groups.get(key) ?? []), item])
    }
    const existingOrders = new Map(workspace.orders.map((order) => [order.id, order]))
    const existingShipments = new Map(workspace.shipments.map((shipment) => [shipment.id, shipment]))
    const orderCodes = new Set(workspace.orders.map((order) => order.id))
    const shipmentCodes = new Set(workspace.shipments.map((shipment) => shipment.id))
    const orders = new Map(existingOrders)
    const shipments = new Map(existingShipments)
    const sameLines = (a: OrderLine[], b: OrderLine[]) => a.length === b.length && a.every((line) => b.some((other) => other.productId === line.productId && other.quantity === line.quantity))
    let changedArrivals = 0

    for (const [key, rows] of groups) {
      const ref = key.startsWith('ref:') ? key.slice(4) : ''
      const first = rows[0]!
      if (ref && failedRefs.has(ref)) { problems.push({ row: first.row, message: `${ref} was left out because another row of it has a problem` }); continue }
      const headFields = kind === 'orders' ? ['customer', 'due', 'location', 'priority'] : ['supplier', 'location', 'arrival']
      const clash = rows.find((item) => headFields.some((field) => item.values[field] !== first.values[field]))
      if (clash) { problems.push({ row: clash.row, message: `${ref} has different ${kind === 'orders' ? 'customer, due date or location' : 'supplier, location or arrival'} on different rows; the whole ${kind === 'orders' ? 'order' : 'shipment'} was left out` }); continue }
      const lines: OrderLine[] = []
      const dupe = rows.find((item) => {
        const productId = productFor(String(item.values.product)).id
        if (lines.some((line) => line.productId === productId)) return true
        lines.push({ productId, quantity: item.values.quantity as number })
        return false
      })
      if (dupe) { problems.push({ row: dupe.row, message: `${ref || 'This record'} lists the same product twice; the whole ${kind === 'orders' ? 'order' : 'shipment'} was left out` }); continue }
      if (lines.length > LIMITS.lines) { problems.push({ row: first.row, message: `${ref} has more than ${LIMITS.lines} lines` }); continue }
      const location = locationFor(String(first.values.location))
      rows.forEach((item) => markUsed(productFor(String(item.values.product)), location))

      if (kind === 'orders') {
        const id = ref || newCode('ORD', orderCodes)
        const previous = existingOrders.get(id)
        const order: Order = {
          id, customer: String(first.values.customer), locationId: location.id, dueAt: String(first.values.due),
          priority: first.values.priority as Order['priority'], lines, evidence,
        }
        if (previous && previous.customer === order.customer && previous.locationId === order.locationId && previous.dueAt === order.dueAt && previous.priority === order.priority && sameLines(previous.lines, lines)) { unchanged += 1; continue }
        orders.set(id, order)
        if (previous) updated += 1; else added += 1
      } else {
        const id = ref || newCode('SH', shipmentCodes)
        const previous = existingShipments.get(id)
        const arrival = String(first.values.arrival)
        const shipment: InboundShipment = {
          id, supplierName: String(first.values.supplier), locationId: location.id, lines,
          originalArrivalAt: previous?.originalArrivalAt ?? arrival, confirmedArrivalAt: arrival, updateSource: table.fileName, evidence,
        }
        if (previous && previous.supplierName === shipment.supplierName && previous.locationId === location.id && previous.confirmedArrivalAt === arrival && sameLines(previous.lines, lines)) { unchanged += 1; continue }
        if (previous && previous.confirmedArrivalAt !== arrival) changedArrivals += 1
        shipments.set(id, shipment)
        if (previous) updated += 1; else added += 1
      }
    }
    if (kind === 'orders') next.orders = [...orders.values()]
    else next.shipments = [...shipments.values()]
    if (changedArrivals > 0) notes.push(`${changedArrivals} shipment${changedArrivals === 1 ? ' has' : 's have'} a new arrival date. If one is late, use Report a delay so Rehearsal checks the orders it affects.`)
  }

  const newProducts = [...createdProducts.values()].filter((product) => usedProducts.has(product.id))
  const newLocations = [...createdLocations.values()].filter((location) => usedLocations.has(location.id))
  next.products = [...workspace.products, ...newProducts]
  next.locations = [...workspace.locations, ...newLocations]
  if (endOfDayDates > 0) notes.push(`${endOfDayDates} date${endOfDayDates === 1 ? ' has' : 's have'} no time, so ${endOfDayDates === 1 ? 'it was' : 'they were'} read as the end of that day (11:59 pm).`)

  const tooBig = (['products', 'locations', 'stock', 'orders', 'shipments'] as const).find((list) => next[list].length > LIMITS[list])
  const blocked = tooBig ? `This would take you past the limit of ${LIMITS[tooBig].toLocaleString('en')} ${tooBig}.` : null
  return { workspace: blocked ? workspace : next, added, updated, unchanged, newProducts: newProducts.map((p) => p.name), newLocations: newLocations.map((l) => l.name), problems, notes, blocked }
}
