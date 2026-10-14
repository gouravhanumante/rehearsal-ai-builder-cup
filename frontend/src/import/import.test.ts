import { describe, expect, it } from 'vitest'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { buildImport, parseDate, parseQuantity } from './build'
import { parseCsv } from './csv'
import { autoMatch } from './match'
import { toTable } from './table'

const blank = () => createBlankWorkspace('Priya Traders', 'IN')
const csv = (text: string, name = 'file.csv') => toTable(name, parseCsv(text.trim()))
const run = (kind: 'stock' | 'orders' | 'shipments', text: string, workspace = blank(), dateOrder: 'dmy' | 'mdy' = 'dmy') => {
  const table = csv(text)
  return buildImport(workspace, kind, table, autoMatch(kind, table.headers), { dateOrder })
}

describe('reading a csv file', () => {
  it('keeps commas, quotes and line breaks inside a quoted cell', () => {
    expect(parseCsv('a,b\n"Cafe, Aroma","say ""hi""\nthere"')).toEqual([['a', 'b'], ['Cafe, Aroma', 'say "hi"\nthere']])
  })
  it('reads semicolon-separated files from Excel in some countries, and Windows line endings', () => {
    expect(parseCsv('\uFEFFa;b\r\n1;2\r\n')).toEqual([['a', 'b'], ['1', '2']])
  })
})

describe('matching column headings', () => {
  it('finds the usual names without being told', () => {
    const mapping = autoMatch('orders', ['Order No', 'Customer Name', 'Item', 'Qty', 'Due Date', 'Warehouse', 'Priority'])
    expect(mapping).toEqual({ ref: 0, customer: 1, product: 2, quantity: 3, due: 4, location: 5, priority: 6 })
  })
  it('never uses one column for two fields', () => {
    const mapping = autoMatch('stock', ['Location', 'Product', 'Qty'])
    const used = Object.values(mapping).filter((column) => column !== null)
    expect(new Set(used).size).toBe(used.length)
  })
})

describe('dates and numbers in a file', () => {
  it('reads 04/10/2026 as 4 October for India and as April 10 for the US', () => {
    expect(parseDate('04/10/2026 09:00', 'dmy', 'Asia/Kolkata')?.iso).toBe('2026-10-04T09:00:00+05:30')
    expect(parseDate('04/10/2026 09:00', 'mdy', 'Asia/Kolkata')?.iso).toBe('2026-04-10T09:00:00+05:30')
  })
  it('refuses a date that does not exist rather than rolling it into the next month', () => {
    expect(parseDate('31/02/2026', 'dmy', 'Asia/Kolkata')).toBeNull()
  })
  it('treats a date with no time as the end of that day, and says so', () => {
    expect(parseDate('2026-10-16', 'dmy', 'Asia/Kolkata')).toEqual({ iso: '2026-10-16T23:59:00+05:30', endOfDay: true })
  })
  it('accepts 1,200 but not 12.5 or a blank, and zero only where zero is a real answer', () => {
    expect(parseQuantity('1,200', false)).toBe(1200)
    expect(parseQuantity('12.5', false)).toBeNull()
    expect(parseQuantity('', false)).toBeNull()
    expect(parseQuantity('0', true)).toBe(0)
    expect(parseQuantity('0', false)).toBeNull()
  })
})

describe('importing stock counts', () => {
  const file = 'Location,Product,Qty\nNorth Hub,Beans,40\nNorth Hub,Tea,12\nSouth Hub,Beans,7'

  it('creates the locations and products it has not seen, and records where the numbers came from', () => {
    const result = run('stock', file)
    expect(result.workspace.locations.map((l) => l.name)).toEqual(['North Hub', 'South Hub'])
    expect(result.workspace.products.map((p) => p.name)).toEqual(['Beans', 'Tea'])
    expect(result.workspace.stock).toHaveLength(3)
    expect(result.workspace.stock.every((record) => record.available.evidence.kind === 'import' && record.available.evidence.source === 'file.csv')).toBe(true)
    expect(result.added).toBe(3)
  })

  it('importing the same file twice changes nothing the second time', () => {
    const first = run('stock', file)
    const second = run('stock', file, first.workspace)
    expect(second.unchanged).toBe(3)
    expect(second.added + second.updated).toBe(0)
    expect(second.workspace.stock).toHaveLength(3)
    expect(second.workspace.products).toHaveLength(2)
  })

  it('updates a count that changed, without duplicating it', () => {
    const first = run('stock', file)
    const second = run('stock', file.replace('Beans,40', 'Beans,35'), first.workspace)
    expect(second.updated).toBe(1)
    expect(second.workspace.stock.filter((r) => r.available.value === 35)).toHaveLength(1)
    expect(second.workspace.stock).toHaveLength(3)
  })

  it('matches names however they are capitalised or spaced, instead of making a second "beans"', () => {
    const first = run('stock', file)
    const second = run('stock', 'Location,Product,Qty\n north  hub ,BEANS,41', first.workspace)
    expect(second.workspace.products).toHaveLength(2)
    expect(second.workspace.locations).toHaveLength(2)
    expect(second.updated).toBe(1)
  })

  it('never turns an unreadable count into zero: the row is reported and that stock stays unknown', () => {
    const result = run('stock', 'Location,Product,Qty\nNorth Hub,Beans,lots\nNorth Hub,Tea,12')
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].row).toBe(2)
    expect(result.workspace.stock).toHaveLength(1)
    expect(result.workspace.products.map((p) => p.name)).toEqual(['Tea'])
  })

  it('keeps the first of two rows for the same place and product, and says so', () => {
    const result = run('stock', 'Location,Product,Qty\nNorth Hub,Beans,40\nNorth Hub,Beans,99')
    expect(result.workspace.stock.map((r) => r.available.value)).toEqual([40])
    expect(result.problems).toHaveLength(1)
  })

  it('does not change the workspace it was given', () => {
    const original = blank()
    run('stock', file, original)
    expect(original.stock).toEqual([])
    expect(original.products).toEqual([])
  })
})

describe('importing orders', () => {
  const header = 'Order,Customer,Product,Qty,Due,Location'

  it('turns rows sharing an order number into one order with several lines', () => {
    const result = run('orders', `${header}\nO-1,Cafe Aroma,Beans,10,16/10/2026 09:00,North Hub\nO-1,Cafe Aroma,Tea,4,16/10/2026 09:00,North Hub\nO-2,Bistro,Beans,6,17/10/2026 09:00,North Hub`)
    expect(result.workspace.orders).toHaveLength(2)
    expect(result.workspace.orders.find((o) => o.id === 'O-1')?.lines).toHaveLength(2)
  })

  it('leaves out a whole order if any of its rows is bad, so demand is never understated', () => {
    const result = run('orders', `${header}\nO-1,Cafe Aroma,Beans,10,16/10/2026 09:00,North Hub\nO-1,Cafe Aroma,Tea,many,16/10/2026 09:00,North Hub\nO-2,Bistro,Beans,6,17/10/2026 09:00,North Hub`)
    expect(result.workspace.orders.map((o) => o.id)).toEqual(['O-2'])
    expect(result.problems.length).toBeGreaterThanOrEqual(2)
    expect(result.workspace.products.map((p) => p.name)).toEqual(['Beans'])
  })

  it('leaves out an order whose rows disagree about who it is for', () => {
    const result = run('orders', `${header}\nO-1,Cafe Aroma,Beans,10,16/10/2026 09:00,North Hub\nO-1,Bistro,Tea,4,16/10/2026 09:00,North Hub`)
    expect(result.workspace.orders).toHaveLength(0)
  })

  it('does not add a product to your list just because it appeared in an order that was left out', () => {
    const result = run('orders', `${header}\nO-1,Cafe Aroma,Gadget,10,16/10/2026 09:00,North Hub\nO-1,Cafe Aroma,Gadget,4,16/10/2026 09:00,North Hub`)
    expect(result.workspace.orders).toHaveLength(0)
    expect(result.workspace.products).toHaveLength(0)
    expect(result.workspace.locations).toHaveLength(0)
  })

  it('marks imported orders as coming from the file, not typed in', () => {
    const result = run('orders', `${header}\nO-1,Cafe Aroma,Beans,10,16/10/2026 09:00,North Hub`)
    expect(result.workspace.orders[0].evidence).toMatchObject({ kind: 'import', source: 'file.csv' })
  })
})

describe('importing shipments', () => {
  const header = 'Shipment,Supplier,Product,Qty,Deliver To,ETA'

  it('a new arrival date for a known shipment keeps the original promise and tells you to report a delay', () => {
    const first = run('shipments', `${header}\nSH-1,Meridian,Beans,20,North Hub,15/10/2026 09:00`)
    const second = run('shipments', `${header}\nSH-1,Meridian,Beans,20,North Hub,20/10/2026 09:00`, first.workspace)
    const shipment = second.workspace.shipments[0]
    expect(second.workspace.shipments).toHaveLength(1)
    expect(shipment.originalArrivalAt).toBe(first.workspace.shipments[0].originalArrivalAt)
    expect(shipment.confirmedArrivalAt).not.toBe(shipment.originalArrivalAt)
    expect(second.notes.join(' ')).toMatch(/Report a delay/)
    expect(second.workspace.disruptions).toHaveLength(0)
  })
})
