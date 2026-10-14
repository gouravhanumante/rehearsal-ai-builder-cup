import { describe, expect, it } from 'vitest'
import { searchPage } from './listPage'

const warehouses = Array.from({ length: 100 }, (_, index) => `Warehouse ${index + 1}`).concat('Wakanda Warehouse')

describe('searching a long list', () => {
  it('still shows the match when the user searches while looking at a later page', () => {
    const result = searchPage(warehouses, (name) => name, 'wakanda', 3)
    expect(result.items).toEqual(['Wakanda Warehouse'])
  })
})
