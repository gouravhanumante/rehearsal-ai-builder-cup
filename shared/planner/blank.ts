import { settingsForCountry } from './countries.js'
import type { Workspace } from './model.js'

/** An empty business: nothing is known yet, and nothing is invented. */
export function createBlankWorkspace(businessName: string, country: string): Workspace {
  return {
    version: 3,
    mode: 'real',
    businessName: businessName.trim().slice(0, 80),
    settings: settingsForCountry(country),
    products: [],
    locations: [],
    movements: [],
    stock: [],
    orders: [],
    shipments: [],
    disruptions: [],
    routes: [],
    suppliers: [],
    conflictDecisions: [],
    approval: null,
  }
}
