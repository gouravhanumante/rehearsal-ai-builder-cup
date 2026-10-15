import { readSheet } from 'read-excel-file/node'
import { describe, expect, it } from 'vitest'
import type { Evidence, Workspace } from '../../../shared/planner/model'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { rehearse } from '../../../shared/planner/plan'
import { cancelRemaining, countStock, sendOrder } from '../../../shared/planner/ledger'
import type { ImportKind } from '../../../shared/import/fields'
import { editorFor, parseField } from '../components/editing/editorConfigs'
import { createFormat } from '../presentation/format'
import type { EditTarget } from '../presentation/planText'
import { buildImport, type DateOrder, type ImportResult } from './build'
import { parseCsv } from './csv'
import { autoMatch, type Mapping } from './match'
import { toTable, type Table } from './table'
import summitStock from '../../../test-data/03-summit-electronics-us/1-stock.csv?raw'
import summitOrders from '../../../test-data/03-summit-electronics-us/2-orders.csv?raw'
import summitShipments from '../../../test-data/03-summit-electronics-us/3-shipments.csv?raw'
import lionStock from '../../../test-data/04-lion-city-foods-singapore-messy/1-stock-count.csv?raw'
import lionOrders from '../../../test-data/04-lion-city-foods-singapore-messy/2-orders.csv?raw'
import lionShipments from '../../../test-data/04-lion-city-foods-singapore-messy/3-shipments.csv?raw'

// The four businesses in test-data/, run the way a person would: import the three files, report the
// delay named in each README, and check the result against that README.
const typed: Evidence = { kind: 'manual', source: 'Entered manually', recordedAt: '2026-10-15T09:00:00Z' }
const xlsx = async (path: string) => toTable(path, await readSheet(`../test-data/${path}`) as unknown[][])
const csv = (name: string, text: string) => toTable(name, parseCsv(text.trim()))

function importInto(workspace: Workspace, kind: ImportKind, table: Table, dateOrder: DateOrder, mapping: Mapping = autoMatch(kind, table.headers)): ImportResult {
  const result = buildImport(workspace, kind, table, mapping, { dateOrder })
  expect(result.blocked).toBeNull()
  return result
}

function enter(workspace: Workspace, target: EditTarget, typedValues: Record<string, string>) {
  const format = createFormat(workspace.settings)
  const config = editorFor(target, workspace, format)
  if (!config) throw new Error('no editor')
  const raw = { ...config.initial, ...typedValues }
  const values = Object.fromEntries(config.fields.map((field) => {
    const result = parseField(field, raw[field.key] ?? '', format)
    if ('error' in result) throw new Error(`${field.key}: ${result.error}`)
    return [field.key, result.value]
  }))
  const evidence = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value === null ? null : typed]))
  return config.apply(values, evidence)
}

const idOf = (workspace: Workspace, list: 'products' | 'locations', name: string) => {
  const found = workspace[list].find((item) => item.name === name)
  if (!found) throw new Error(`${name} not imported`)
  return found.id
}
const countOf = (workspace: Workspace, location: string, product: string) =>
  workspace.stock.find((record) => record.locationId === idOf(workspace, 'locations', location) && record.productId === idOf(workspace, 'products', product))?.available.value
const delayOf = (workspace: Workspace, now: string) => rehearse(workspace, now).impact.groups.filter((group) => group.kind === 'delay')
const customersOf = (workspace: Workspace, orderIds: string[]) => orderIds.map((id) => workspace.orders.find((order) => order.id === id)?.customer)

async function priya() {
  let workspace = createBlankWorkspace('Priya Beverages', 'IN')
  for (const [kind, file] of [['stock', '1-stock'], ['orders', '2-orders'], ['shipments', '3-shipments']] as const) {
    workspace = importInto(workspace, kind, await xlsx(`01-priya-beverages-india/${file}.xlsx`), 'dmy').workspace
  }
  return workspace
}

async function brightside() {
  let workspace = createBlankWorkspace('Brightside Pharmacy Supply', 'GB')
  for (const [kind, file] of [['stock', '1-stock'], ['orders', '2-orders'], ['shipments', '3-shipments']] as const) {
    workspace = importInto(workspace, kind, await xlsx(`02-brightside-pharmacy-uk/${file}.xlsx`), 'dmy').workspace
  }
  return workspace
}

function summit() {
  let workspace = createBlankWorkspace('Summit Electronics Wholesale', 'US')
  workspace = importInto(workspace, 'stock', csv('1-stock.csv', summitStock), 'mdy').workspace
  workspace = importInto(workspace, 'orders', csv('2-orders.csv', summitOrders), 'mdy').workspace
  return importInto(workspace, 'shipments', csv('3-shipments.csv', summitShipments), 'mdy').workspace
}

// Column names Rehearsal can't guess; in the app Ask Gemini suggests them and the person checks.
const lionColumns = {
  stock: { location: 0, product: 1, quantity: 2 },
  orders: { ref: 0, customer: 1, product: 2, quantity: 3, due: 4, location: 5, priority: 6 },
  shipments: { ref: 0, supplier: 1, product: 2, quantity: 3, arrival: 4, location: 5 },
}
function lionCity() {
  let workspace = createBlankWorkspace('Lion City Foods', 'SG')
  const stock = importInto(workspace, 'stock', csv('1-stock-count.csv', lionStock), 'dmy', lionColumns.stock)
  workspace = stock.workspace
  const orders = importInto(workspace, 'orders', csv('2-orders.csv', lionOrders), 'dmy', lionColumns.orders)
  workspace = importInto(orders.workspace, 'shipments', csv('3-shipments.csv', lionShipments), 'dmy', lionColumns.shipments).workspace
  return { workspace, stock, orders }
}

describe('01 Priya Beverages (India, Excel): SH-7001 mango juice moves to 22 Oct 5 pm', () => {
  const now = '2026-10-15T09:00:00+05:30'

  it('Mumbai has 30, Spice Route Cafe (40) and Metro Mart (50) are due first: 60 cases exposed, 2 orders at risk', async () => {
    const workspace = enter(await priya(), { type: 'report-delay', shipmentId: 'SH-7001' }, { arrivalAt: '2026-10-22T17:00' })
    const [delay] = delayOf(workspace, now)
    expect(delay).toMatchObject({ exposedQuantity: 60, productId: idOf(workspace, 'products', 'Mango Juice 1L'), locationId: idOf(workspace, 'locations', 'Mumbai Warehouse') })
    expect(customersOf(workspace, delay.affectedOrderIds)).toEqual(['Spice Route Cafe', 'Metro Mart'])
  })

  it('an order with two products is one order with two lines, and only its mango juice is at risk', async () => {
    const workspace = await priya()
    const spiceRoute = workspace.orders.find((order) => order.id === 'ORD-5001')
    expect(spiceRoute?.lines.map((line) => line.quantity)).toEqual([40, 60])
    expect(delayOf(enter(workspace, { type: 'report-delay', shipmentId: 'SH-7001' }, { arrivalAt: '2026-10-22T17:00' }), now)).toHaveLength(1)
  })

  it('a time typed as 10:00 in Excel is read as 10:00, not 9:59 (Excel stores it a hair under)', async () => {
    const workspace = await priya()
    expect(workspace.orders.find((order) => order.id === 'ORD-5002')?.dueAt).toBe('2026-10-17T10:00:00+05:30')
    expect(workspace.shipments.find((shipment) => shipment.id === 'SH-7001')?.originalArrivalAt).toBe('2026-10-15T16:00:00+05:30')
  })
})

describe('02 Brightside Pharmacy (UK, Excel, dates as text): SH-3301 paracetamol moves to 22 Oct 2 pm', () => {
  it("Leeds has 40, St Mary's (60, urgent) and HealthFirst (50) are due first: 70 boxes exposed, 2 orders at risk", async () => {
    const workspace = enter(await brightside(), { type: 'report-delay', shipmentId: 'SH-3301' }, { arrivalAt: '2026-10-22T14:00' })
    const [delay] = delayOf(workspace, '2026-10-15T09:00:00+01:00')
    expect(delay.exposedQuantity).toBe(70)
    expect(customersOf(workspace, delay.affectedOrderIds)).toEqual(["St Mary's Hospital Pharmacy", 'HealthFirst Chemists'])
  })
})

describe('03 Summit Electronics (US, CSV, month/day dates): ASN-4410 chargers move to Oct 23 1 pm', () => {
  const now = '2026-10-15T09:00:00-04:00'
  const delayed = () => enter(summit(), { type: 'report-delay', shipmentId: 'ASN-4410' }, { arrivalAt: '2026-10-23T13:00' })

  it('Dallas has 35, TechNest (60, VIP) and Lone Star (50) are due first: 75 exposed, 2 orders at risk', () => {
    const workspace = delayed()
    const [delay] = delayOf(workspace, now)
    expect(delay.exposedQuantity).toBe(75)
    expect(customersOf(workspace, delay.affectedOrderIds)).toEqual(['TechNest Austin', 'Lone Star Office Supply'])
  })

  it('reads 10/16/2026 as October 16 for a US business', () => {
    expect(summit().orders.find((order) => order.id === 'PO-88101')?.dueAt).toBe('2026-10-16T15:00:00-04:00')
  })

  it('TechNest cannot dispatch 60 chargers from a count of 35; neither product leaves', () => {
    const workspace = delayed()
    const order = workspace.orders.find((item) => item.id === 'PO-88101')!
    expect(sendOrder(workspace, order.id, order.lines, now)).toHaveProperty('error')
    expect(countOf(workspace, 'Dallas Warehouse', '65W GaN Charger')).toBe(35)
    expect(countOf(workspace, 'Dallas Warehouse', 'Wireless Mouse')).toBe(60)
  })

  it('after correcting Dallas to 60 chargers, TechNest can dispatch both products and Lone Star is 50 short', () => {
    const data = delayed()
    const locationId = data.locations.find((location) => location.name === 'Dallas Warehouse')!.id
    const productId = data.products.find((product) => product.name === '65W GaN Charger')!.id
    const at = new Date().toISOString()
    const corrected = countStock(data, locationId, productId, 60, { kind: 'manual', source: 'Recount', recordedAt: at }, at)
    if ('error' in corrected) throw new Error(corrected.error)
    const order = data.orders.find((item) => item.id === 'PO-88101')!
    const sent = sendOrder(corrected.workspace, order.id, order.lines, at)
    if ('error' in sent) throw new Error(sent.error)
    const workspace = sent.workspace
    expect(countOf(workspace, 'Dallas Warehouse', '65W GaN Charger')).toBe(0)
    expect(countOf(workspace, 'Dallas Warehouse', 'Wireless Mouse')).toBe(20)
    const [delay] = delayOf(workspace, now)
    expect(delay.exposedQuantity).toBe(50)
    expect(customersOf(workspace, delay.affectedOrderIds)).toEqual(['Lone Star Office Supply'])
  })
})

describe('04 Lion City Foods (Singapore, messy semicolon CSV): D-501 rice moves to 21 Oct 3 pm', () => {
  const now = '2026-10-15T09:00:00+08:00'

  it('leaves out "twelve", a blank, -5 and a repeated row instead of guessing, and keeps the first Jurong rice row (1,020)', () => {
    const { workspace, stock } = lionCity()
    expect(stock.problems.map((problem) => problem.row).sort((a, b) => a - b)).toEqual([6, 7, 10, 12])
    expect(countOf(workspace, 'Jurong Outlet', 'Jasmine Rice 5kg')).toBe(1020)
    expect(countOf(workspace, 'Tampines Outlet', 'Cooking Oil 2L')).toBeUndefined()
  })

  it('treats LION CITY DC and "lion city dc " as one place', () => {
    expect(lionCity().workspace.locations.filter((location) => location.name.toLowerCase().trim() === 'lion city dc')).toHaveLength(1)
  })

  it('leaves out T-9005 (31 November), T-9006 (rows disagree on the date) and T-9007 ("lots") whole', () => {
    expect(lionCity().workspace.orders.map((order) => order.id)).toEqual(['T-9001', 'T-9002', 'T-9003', 'T-9004', 'T-9008'])
  })

  it('Lion City DC has 420, Hawker Centre Co-op (300, rush) and Sunrise Catering (250) are due first: 130 exposed, only Sunrise short', () => {
    const workspace = enter(lionCity().workspace, { type: 'report-delay', shipmentId: 'D-501' }, { arrivalAt: '2026-10-21T15:00' })
    const [delay] = delayOf(workspace, now)
    expect(delay.exposedQuantity).toBe(130)
    // Hawker's 300 come out of the 420 on hand, so only Sunrise (120 of 250) is at risk.
    expect(customersOf(workspace, delay.affectedOrderIds)).toEqual(['Sunrise Catering'])
  })

  it('cancelling Hawker Centre (rice and oil) frees its rice: Sunrise is covered and nothing is exposed', () => {
    const cancelled = cancelRemaining(enter(lionCity().workspace, { type: 'report-delay', shipmentId: 'D-501' }, { arrivalAt: '2026-10-21T15:00' }), 'T-9001', now)
    if ('error' in cancelled) throw new Error(cancelled.error)
    const workspace = cancelled.workspace
    expect(delayOf(workspace, now)[0]?.exposedQuantity ?? 0).toBe(0)
    expect(countOf(workspace, 'Lion City DC', 'Jasmine Rice 5kg')).toBe(420)
  })
})
