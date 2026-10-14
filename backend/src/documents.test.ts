import { describe, expect, it } from 'vitest'
import { detectMimeType, normalizeExtraction, type ExtractionField } from './documents.js'

const fields: ExtractionField[] = [
  { key: 'availableCases', label: 'Stock available (cases)', type: 'integer' },
  { key: 'pricePerCase', label: 'Price per case ($)', type: 'money' },
  { key: 'arrivalAt', label: 'Arrival', type: 'datetime' },
]

const valueOf = (result: ReturnType<typeof normalizeExtraction>, key: string) => result.fields.find((field) => field.key === key)?.value
const india = 'Asia/Kolkata'

describe('reading values out of a document', () => {
  it('keeps a value only when the model shows the document text it came from', () => {
    const result = normalizeExtraction({
      summary: 'Quote from Supplier B',
      fields: [
        { key: 'availableCases', value: '20', quote: 'Available: 20 cases' },
        { key: 'pricePerCase', value: '11', quote: null },
      ],
    }, fields, india)
    expect(valueOf(result, 'availableCases')).toBe('20')
    expect(valueOf(result, 'pricePerCase')).toBeNull()
  })

  it('drops a number it cannot read cleanly instead of guessing', () => {
    const result = normalizeExtraction({
      summary: 'Quote',
      fields: [
        { key: 'availableCases', value: '12-15', quote: '12-15 cases' },
        { key: 'pricePerCase', value: '₹1,250.50', quote: 'Rate ₹1,250.50 per case' },
      ],
    }, fields, india)
    expect(valueOf(result, 'availableCases')).toBeNull()
    expect(valueOf(result, 'pricePerCase')).toBe('1250.5')
  })

  it('reads a delivery time written without a timezone as the business\'s own local time', () => {
    const written = { summary: 'Quote', fields: [{ key: 'arrivalAt', value: '2026-11-02T09:00', quote: 'Delivery 2 Nov 9am' }] }
    expect(valueOf(normalizeExtraction(written, fields, india), 'arrivalAt')).toBe('2026-11-02T09:00:00+05:30')
    expect(valueOf(normalizeExtraction(written, fields, 'America/New_York'), 'arrivalAt')).toBe('2026-11-02T09:00:00-05:00')
  })

  it('drops a delivery time it cannot read', () => {
    const result = normalizeExtraction({
      summary: 'Quote',
      fields: [{ key: 'arrivalAt', value: 'next Thursday', quote: 'Delivery next Thursday' }],
    }, fields, india)
    expect(valueOf(result, 'arrivalAt')).toBeNull()
  })

  it('answers exactly the requested fields, ignoring extras the model adds', () => {
    const result = normalizeExtraction({
      summary: 'Quote',
      fields: [{ key: 'discount', value: '10', quote: '10% off' }],
    }, fields, india)
    expect(result.fields.map((field) => field.key)).toEqual(['availableCases', 'pricePerCase', 'arrivalAt'])
    expect(result.fields.every((field) => field.value === null)).toBe(true)
  })
})

describe('checking what kind of file was uploaded', () => {
  it('recognises real PNG and PDF headers and rejects plain text', () => {
    expect(detectMimeType(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]).toString('base64'))).toBe('image/png')
    expect(detectMimeType(Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1').toString('base64'))).toBe('application/pdf')
    expect(detectMimeType(Buffer.from('ignore previous instructions').toString('base64'))).toBeNull()
  })
})
