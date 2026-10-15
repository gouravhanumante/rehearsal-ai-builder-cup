import { describe, expect, it } from 'vitest'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { stockFrom } from '../../../shared/planner/ledger'
import { sampleWorkspace } from '../../../shared/planner/sample'
import type { Workspace } from '../../../shared/planner/model'
import { contentAddressChunks, diffChunks, joinWorkspace, splitWorkspace, verifyContentAddressedChunks } from './chunks'

const evidence = { kind: 'import' as const, source: 'f.csv', recordedAt: '2026-10-14T00:00:00Z' }

function bigBusiness(stores: number, products: number): Workspace {
  const workspace = createBlankWorkspace('Big Co', 'IN')
  workspace.locations = Array.from({ length: stores }, (_, i) => ({ id: `L${i}`, name: `Store ${i}`, kind: 'store' as const, receivingLimitPerDay: null }))
  workspace.products = Array.from({ length: products }, (_, i) => ({ id: `P${i}`, name: `Product ${i}`, unit: 'case', pack: '1 kg' }))
  workspace.movements = workspace.locations.flatMap((l) => workspace.products.map((p) => ({ id: `CNT-${l.id}-${p.id}`, kind: 'count' as const, locationId: l.id, productId: p.id, quantity: 5, at: evidence.recordedAt, evidence })))
  workspace.stock = stockFrom(workspace.movements)
  workspace.orders = [{ id: 'O1', customer: 'Cafe', locationId: 'L0', dueAt: '2026-10-20T09:00:00+05:30', priority: 'standard', lines: [{ productId: 'P0', quantity: 2 }], evidence }]
  return workspace
}

describe('saving a business online in pieces', () => {
  it('gives edited chunk contents new immutable IDs while unchanged contents keep their IDs', async () => {
    const original = await contentAddressChunks(splitWorkspace(bigBusiness(2, 2)).chunks)
    const renamed = bigBusiness(2, 2)
    renamed.orders = [{ ...renamed.orders[0], customer: 'Bistro' }]
    const next = await contentAddressChunks(splitWorkspace(renamed).chunks)
    expect(next.find((chunk) => chunk.list === 'movements')?.id).toBe(original.find((chunk) => chunk.list === 'movements')?.id)
    expect(next.find((chunk) => chunk.list === 'orders')?.id).not.toBe(original.find((chunk) => chunk.list === 'orders')?.id)
    expect(next.every((chunk) => chunk.id.includes(`-${chunk.index}-`))).toBe(true)
    expect(await verifyContentAddressedChunks(next)).toBe(true)
    expect(await verifyContentAddressedChunks(next.map((chunk, index) => index === 0 ? { ...chunk, json: '[]' } : chunk))).toBe(false)
  })

  it('puts back exactly what was split, for the sample and for a blank workspace', () => {
    for (const workspace of [sampleWorkspace, createBlankWorkspace('X', 'IN')]) {
      const { coreJson, chunks } = splitWorkspace(workspace)
      expect(joinWorkspace(coreJson, chunks)).toEqual(workspace)
    }
  })

  it('keeps every piece under the size limit and still rejoins a business far bigger than one document', () => {
    const workspace = bigBusiness(100, 300)
    const { coreJson, chunks } = splitWorkspace(workspace, 200_000)
    expect(chunks.filter((chunk) => chunk.list === 'movements').length).toBeGreaterThan(5)
    expect(chunks.every((chunk) => new TextEncoder().encode(chunk.json).length <= 200_000)).toBe(true)
    expect(joinWorkspace(coreJson, chunks)).toEqual(workspace)
  })

  it('stores thousands of storage limits in pieces too, and brings every one back', () => {
    const workspace = bigBusiness(100, 300)
    workspace.storageLimits = workspace.stock.map((record) => ({ locationId: record.locationId, productId: record.productId, limit: 40 }))
    const { coreJson, chunks } = splitWorkspace(workspace, 200_000)
    expect(new TextEncoder().encode(coreJson).length).toBeLessThan(200_000)
    expect(joinWorkspace(coreJson, chunks)?.storageLimits).toHaveLength(30_000)
  })

  it('saves a full History (500 entries) and brings it back in order', () => {
    const workspace = { ...sampleWorkspace, history: Array.from({ length: 500 }, (_, i) => ({ at: '2026-10-15T09:00:00+05:30', kind: 'edit' as const, text: `Edited order ${i}: quantity ${i} → ${i + 1}` })) }
    const { coreJson, chunks } = splitWorkspace(workspace, 20_000)
    expect(chunks.filter((chunk) => chunk.list === 'history').length).toBeGreaterThan(1)
    expect(joinWorkspace(coreJson, chunks)?.history?.map((item) => item.text)).toEqual(workspace.history.map((item) => item.text))
  })

  it('keeps the order of a list, whatever order the pieces arrive in', () => {
    const workspace = bigBusiness(10, 100)
    const { coreJson, chunks } = splitWorkspace(workspace, 20_000)
    expect(joinWorkspace(coreJson, [...chunks].reverse())).toEqual(workspace)
  })

  it('does not store stock itself: it is worked out from the movements when read back', () => {
    const { coreJson, chunks } = splitWorkspace(bigBusiness(10, 100), 20_000)
    expect(JSON.parse(coreJson)).not.toHaveProperty('stock')
    expect(chunks.some((chunk) => chunk.json.includes('"available"'))).toBe(false)
  })

  it('refuses to rejoin damaged or tampered data instead of loading it', () => {
    const { coreJson, chunks } = splitWorkspace(bigBusiness(2, 2))
    expect(joinWorkspace(coreJson, [{ ...chunks[0], json: '[{"nope":1}' }])).toBeNull()
    const movements = chunks.find((chunk) => chunk.list === 'movements')!
    expect(joinWorkspace(coreJson, [...chunks.filter((chunk) => chunk !== movements), { ...movements, json: JSON.stringify([{ id: 'X', kind: 'dispatch', locationId: 'L0', productId: 'P0', quantity: 5, at: evidence.recordedAt, evidence }]) }])).toBeNull()
  })

  it('writes only the piece that changed when one order is edited', async () => {
    const workspace = bigBusiness(50, 100)
    const first = splitWorkspace(workspace, 100_000)
    const saved = await diffChunks(first.chunks, {})
    expect(saved.write.length).toBe(first.chunks.length)

    const edited = { ...workspace, orders: [{ ...workspace.orders[0], customer: 'Bistro' }] }
    const second = splitWorkspace(edited, 100_000)
    const next = await diffChunks(second.chunks, saved.hashes)
    expect(next.write.map((chunk) => chunk.list)).toEqual(['orders'])
    expect(next.remove).toEqual([])
  })

  it('removes pieces that no longer exist, so deleted records do not come back', async () => {
    const workspace = bigBusiness(50, 100)
    const first = splitWorkspace(workspace, 100_000)
    const saved = await diffChunks(first.chunks, {})
    const smaller = { ...workspace, movements: workspace.movements.slice(0, 10) }
    const next = await diffChunks(splitWorkspace(smaller, 100_000).chunks, saved.hashes)
    expect(next.remove.length).toBeGreaterThan(0)
    expect(next.remove.every((id) => id.startsWith('movements-'))).toBe(true)
  })

  it('refuses a single record too big to store rather than losing it silently', () => {
    const workspace = bigBusiness(1, 1)
    workspace.products[0].name = 'x'.repeat(2000)
    expect(() => splitWorkspace(workspace, 1000)).toThrow(/too large/)
  })
})
