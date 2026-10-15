import { settingsForCountry } from './countries.js'
import { stockFrom } from './ledger.js'
import type { Evidence, Movement, Workspace } from './model.js'

export const sampleEvidence: Evidence = { kind: 'sample', source: 'Sample data', recordedAt: '2026-10-15T08:42:00+05:30' }
/** The sample's story happens on this morning, whatever today's real date is. */
export const SAMPLE_NOW = '2026-10-15T09:00:00+05:30'
const unknown = { value: null, evidence: null }
const opening: Movement[] = [
  { id: 'CNT-north-harbor-blend', kind: 'count', locationId: 'north', productId: 'harbor-blend', quantity: 14, at: sampleEvidence.recordedAt, evidence: sampleEvidence },
  { id: 'CNT-south-harbor-blend', kind: 'count', locationId: 'south', productId: 'harbor-blend', quantity: 14, at: sampleEvidence.recordedAt, evidence: sampleEvidence },
]

export const sampleWorkspace: Workspace = {
  version: 3,
  mode: 'demo',
  businessName: 'Northstar Supply',
  settings: settingsForCountry('IN'),
  products: [{ id: 'harbor-blend', name: 'Harbor Blend Coffee', unit: 'case', pack: '1 kg case' }],
  locations: [
      { id: 'north', name: 'North Hub', kind: 'warehouse', receivingLimitPerDay: 8, customerTravelHours: unknown },
      { id: 'south', name: 'South Hub', kind: 'warehouse', receivingLimitPerDay: null, customerTravelHours: unknown },
  ],
  movements: opening,
  stock: stockFrom(opening),
  orders: [
    { id: 'ORD-1082', customer: 'Common Ground Cafe', locationId: 'north', dueAt: '2026-10-15T14:00:00+05:30', priority: 'protected', lines: [{ productId: 'harbor-blend', quantity: 18 }], evidence: sampleEvidence },
    { id: 'ORD-1086', customer: 'Harbor Market', locationId: 'north', dueAt: '2026-10-16T12:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity: 12 }], evidence: sampleEvidence },
    { id: 'ORD-1091', customer: 'Daily Goods Co.', locationId: 'north', dueAt: '2026-10-16T12:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity: 8 }], evidence: sampleEvidence },
    { id: 'ORD-1104', customer: 'Lakeview Grocers', locationId: 'north', dueAt: '2026-10-19T10:00:00+05:30', priority: 'standard', lines: [{ productId: 'harbor-blend', quantity: 10 }], evidence: sampleEvidence },
  ],
  shipments: [{
    id: 'SH-204',
    supplierName: 'Meridian Foods',
    locationId: 'north',
    lines: [{ productId: 'harbor-blend', quantity: 24 }],
    originalArrivalAt: '2026-10-13T09:00:00+05:30',
    confirmedArrivalAt: '2026-10-16T15:00:00+05:30',
    updateSource: 'Supplier update',
    evidence: sampleEvidence,
  }],
  disruptions: [{ id: 'INC-0248', kind: 'shipment-delay', shipmentId: 'SH-204' }],
  routes: [{
    id: 'south-to-north',
    fromLocationId: 'south',
    toLocationId: 'north',
    arrivalAt: unknown,
    travelHours: { value: 3, evidence: sampleEvidence },
    costPerTrip: 55,
    costPerUnit: 5,
    quotes: [],
  }],
  suppliers: [{
    id: 'supplier-b',
    name: 'Supplier B',
    offers: [{ productId: 'harbor-blend', locationId: 'north', available: unknown, pricePerUnit: unknown, arrivalAt: unknown }],
  }],
  conflictDecisions: [],
  approval: null,
}
