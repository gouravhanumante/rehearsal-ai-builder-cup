import { describe, expect, it } from 'vitest'
import { mappingRequestSchema, normalizeMapping } from './importMapping.js'

const request = mappingRequestSchema.parse({ kind: 'stock', headers: ['Site', 'Item', 'On hand', 'Notes'] })

describe('what a column suggestion is allowed to say', () => {
  it('passes on a sensible suggestion', () => {
    const result = normalizeMapping({ mapping: [{ field: 'location', column: 0 }, { field: 'product', column: 1 }, { field: 'quantity', column: 2 }] }, request)
    expect(result.mapping).toEqual({ location: 0, product: 1, quantity: 2 })
  })

  it('drops a column that does not exist in the file', () => {
    const result = normalizeMapping({ mapping: [{ field: 'location', column: 9 }, { field: 'product', column: -1 }, { field: 'quantity', column: 1.5 }] }, request)
    expect(result.mapping).toEqual({ location: null, product: null, quantity: null })
  })

  it('never uses one column for two fields', () => {
    const result = normalizeMapping({ mapping: [{ field: 'location', column: 1 }, { field: 'product', column: 1 }] }, request)
    expect(result.mapping).toEqual({ location: 1, product: null, quantity: null })
  })

  it('ignores fields this kind of file does not have', () => {
    const result = normalizeMapping({ mapping: [{ field: 'customer', column: 3 }, { field: 'quantity', column: 2 }] }, request)
    expect(Object.keys(result.mapping).sort()).toEqual(['location', 'product', 'quantity'])
    expect(result.mapping.quantity).toBe(2)
  })

  it('refuses a request with unexpected extra fields, so only headers and a few sample rows can be sent', () => {
    expect(mappingRequestSchema.safeParse({ kind: 'stock', headers: ['a'], rows: [['1']] }).success).toBe(false)
    expect(mappingRequestSchema.safeParse({ kind: 'stock', headers: ['a'], sampleRows: Array(6).fill(['1']) }).success).toBe(false)
  })
})
