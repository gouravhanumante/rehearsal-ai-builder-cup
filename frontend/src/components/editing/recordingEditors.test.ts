import { describe, expect, it, vi } from 'vitest'
import type { Evidence, Workspace } from '../../../../shared/planner/model'
import { createBlankWorkspace } from '../../../../shared/planner/blank'
import { rehearse } from '../../../../shared/planner/plan'
import { createFormat } from '../../presentation/format'
import type { EditTarget } from '../../presentation/planText'
import { editorFor, parseField } from './editorConfigs'

const typed: Evidence = { kind: 'manual', source: 'Entered manually', recordedAt: '2026-10-14T09:00:00+05:30' }

/** Fill in an editor the way a person would: type each value, then apply. */
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
  return { workspace: config.apply(values, evidence), config, values }
}

function smallBusiness() {
  let workspace = createBlankWorkspace('Priya Traders', 'IN')
  workspace = enter(workspace, { type: 'new-location' }, { name: 'North Hub', kind: 'warehouse' }).workspace
  workspace = enter(workspace, { type: 'new-product' }, { name: 'Beans', perPackage: '1' }).workspace
  const location = workspace.locations[0].id
  const product = workspace.products[0].id
  workspace = enter(workspace, { type: 'stock', locationId: location, productId: product }, { available: '5' }).workspace
  workspace = enter(workspace, { type: 'new-order' }, { customer: 'Cafe Aroma', quantity: '10', dueAt: '2026-10-16T09:00' }).workspace
  workspace = enter(workspace, { type: 'new-shipment' }, { supplierName: 'Meridian', quantity: '20', arrivalAt: '2026-10-15T09:00' }).workspace
  return workspace
}

describe('a distributor builds a business by hand, then a shipment is late', () => {
  it('a product asks only for its name and how many items one package holds; stock is counted in packages', () => {
    const { workspace, config } = enter(createBlankWorkspace('Priya Traders', 'IN'), { type: 'new-product' }, { name: 'Red pen', perPackage: '10' })
    expect(config.fields.map((field) => field.key)).toEqual(['name', 'perPackage'])
    expect(workspace.products[0]).toMatchObject({ name: 'Red pen', unit: 'package', perPackage: 10, pack: '10 per package' })
  })

  it('a package holds at least one item', () => {
    const workspace = createBlankWorkspace('Priya Traders', 'IN')
    const config = editorFor({ type: 'new-product' }, workspace, createFormat(workspace.settings))
    expect(config?.validate?.({ name: 'Teddy', perPackage: 0 })).toMatch(/at least 1/)
    expect(config?.validate?.({ name: 'Teddy', perPackage: 1 })).toBeNull()
  })

  it('sets storage capacity on a product count for one warehouse, not on the product', () => {
    const workspace = createBlankWorkspace('Priya Traders', 'IN')
    const format = createFormat(workspace.settings)
    const product = editorFor({ type: 'new-product' }, workspace, format)
    expect(product?.fields.some((field) => field.key === 'storageLimit')).toBe(false)

    const withItems = enter(workspace, { type: 'new-location' }, { name: 'North Hub', kind: 'warehouse' }).workspace
    const withProduct = enter(withItems, { type: 'new-product' }, { name: 'Beans', perPackage: '20' }).workspace
    const location = withProduct.locations[0]
    const item = withProduct.products[0]
    const stock = enter(withProduct, { type: 'stock', locationId: location.id, productId: item.id }, { available: '5', storageLimit: '20' }).workspace

    expect(stock.products[0]).not.toHaveProperty('storageLimit')
    expect(stock.storageLimits).toEqual([{ locationId: location.id, productId: item.id, limit: 20 }])
  })

  it('a backup supplier who sells brooms and pens is one supplier with both products, each waiting for their reply', () => {
    let workspace = smallBusiness()
    workspace = enter(workspace, { type: 'new-product' }, { name: 'Pens', perPackage: '10' }).workspace
    const [beans, pens] = workspace.products.map((product) => product.id)
    const { workspace: next } = enter(workspace, { type: 'new-supplier' }, { name: 'Vibgyor', productIds: JSON.stringify([beans, pens]), locationId: workspace.locations[0].id })
    expect(next.suppliers).toHaveLength(1)
    expect(next.suppliers[0].offers.map((offer) => offer.productId)).toEqual([beans, pens])
    expect(next.suppliers[0].offers.every((offer) => offer.available.value === null && offer.pricePerUnit.value === null)).toBe(true)
  })

  it('watches the order without raising an alarm while every shipment is on time', () => {
    const workspace = smallBusiness()
    expect(workspace.orders).toHaveLength(1)
    expect(workspace.shipments).toHaveLength(1)
    expect(rehearse(workspace).impact.affectedOrderIds).toEqual([])
  })

  it('reporting that the shipment is late puts the order that depended on it at risk', () => {
    const { workspace } = enter(smallBusiness(), { type: 'report-delay' }, { arrivalAt: '2026-10-20T09:00' })
    expect(workspace.disruptions).toHaveLength(1)
    expect(rehearse(workspace).impact.affectedOrderIds).toEqual([workspace.orders[0].id])
  })

  it('reporting the same shipment late twice moves the date but keeps one problem, not two', () => {
    const once = enter(smallBusiness(), { type: 'report-delay' }, { arrivalAt: '2026-10-20T09:00' }).workspace
    const twice = enter(once, { type: 'report-delay' }, { arrivalAt: '2026-10-22T09:00' }).workspace
    expect(twice.disruptions).toHaveLength(1)
    expect(twice.shipments[0].confirmedArrivalAt).not.toBe(once.shipments[0].confirmedArrivalAt)
  })

  it('keeps the original promised date, so the delay can still be shown', () => {
    const before = smallBusiness()
    const { workspace } = enter(before, { type: 'report-delay' }, { arrivalAt: '2026-10-20T09:00' })
    expect(workspace.shipments[0].originalArrivalAt).toBe(before.shipments[0].originalArrivalAt)
  })

  it('treats everything typed in as unverified, never as proven', () => {
    const workspace = smallBusiness()
    expect(workspace.orders[0].evidence.kind).toBe('manual')
    expect(workspace.shipments[0].evidence.kind).toBe('manual')
  })

  it('never gives two orders the same code, even if the random code happens to repeat', () => {
    const codes = ['AAAA0000-x', 'AAAA0000-x', 'BBBB1111-x']
    const spy = vi.spyOn(crypto, 'randomUUID').mockImplementation(() => (codes.shift() ?? 'CCCC2222-x') as `${string}-${string}-${string}-${string}-${string}`)
    try {
      let workspace = createBlankWorkspace('Priya Traders', 'IN')
      workspace = enter(workspace, { type: 'new-location' }, { name: 'North Hub' }).workspace
      workspace = enter(workspace, { type: 'new-product' }, { name: 'Beans', perPackage: '1' }).workspace
      spy.mockClear()
      codes.splice(0, codes.length, 'AAAA0000-x', 'AAAA0000-x', 'BBBB1111-x')
      for (const customer of ['One', 'Two']) {
        workspace = enter(workspace, { type: 'new-order' }, { customer, quantity: '1', dueAt: '2026-10-18T09:00' }).workspace
      }
      const ids = workspace.orders.map((order) => order.id)
      expect(new Set(ids).size).toBe(2)
    } finally {
      spy.mockRestore()
    }
  })
})

describe('transfer routes', () => {
  it('cannot move stock from a place to itself', () => {
    let workspace = createBlankWorkspace('Priya Traders', 'IN')
    workspace = enter(workspace, { type: 'new-location' }, { name: 'North Hub' }).workspace
    workspace = enter(workspace, { type: 'new-location' }, { name: 'South Hub' }).workspace
    const [north, south] = workspace.locations
    const format = createFormat(workspace.settings)
    const config = editorFor({ type: 'new-route' }, workspace, format)
    expect(config?.validate?.({ fromLocationId: north.id, toLocationId: north.id, arrivalAt: null })).toMatch(/two different/)
    expect(config?.validate?.({ fromLocationId: north.id, toLocationId: south.id, arrivalAt: null })).toBeNull()
  })
})
