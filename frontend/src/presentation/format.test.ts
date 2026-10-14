import { describe, expect, it } from 'vitest'
import { settingsForCountry } from '../../../shared/planner/countries'
import { createFormat, pluralUnit } from './format'

describe('money and time follow the workspace country', () => {
  it('shows rupees for India and dollars for the US', () => {
    expect(createFormat(settingsForCountry('IN')).money(264)).toBe('₹264')
    expect(createFormat(settingsForCountry('US')).money(264)).toBe('$264')
  })

  it('reads a typed time as India time for an Indian business', () => {
    expect(createFormat(settingsForCountry('IN')).fromInput('2026-10-15T10:00')).toBe('2026-10-15T10:00:00+05:30')
  })

  it('uses the right New York offset on each side of the daylight-saving change', () => {
    const newYork = createFormat(settingsForCountry('US'))
    expect(newYork.fromInput('2026-10-30T09:00')).toBe('2026-10-30T09:00:00-04:00')
    expect(newYork.fromInput('2026-11-02T09:00')).toBe('2026-11-02T09:00:00-05:00')
  })

  it('shows a stored time back as the same local time it was typed', () => {
    const newYork = createFormat(settingsForCountry('US'))
    expect(newYork.toInput(newYork.fromInput('2026-11-02T09:00') as string)).toBe('2026-11-02T09:00')
  })
})

describe('product units read naturally in quantities', () => {
  it('uses common plurals and keeps measurement abbreviations unchanged', () => {
    expect(pluralUnit('box', 2)).toBe('boxes')
    expect(pluralUnit('packet', 2)).toBe('packets')
    expect(pluralUnit('case', 2)).toBe('cases')
    expect(pluralUnit('kg', 2)).toBe('kg')
    expect(pluralUnit('mL', 2)).toBe('mL')
  })
})
