import type { ImportKind } from '../../../shared/import/fields'
import type { Mapping } from './match'
import type { Table } from './table'

// Test data only: set to false before real customers so just the column names leave the browser (see docs/TODO.md).
export const SEND_SAMPLE_ROWS = true

/** Asks Gemini which column is which. Only headers (and optionally a few trimmed sample rows) are sent. */
export async function suggestMapping(kind: ImportKind, table: Table): Promise<Mapping> {
  const response = await fetch('/api/imports/map', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      kind,
      headers: table.headers.slice(0, 60).map((header) => header.slice(0, 80)),
      ...(SEND_SAMPLE_ROWS ? { sampleRows: table.rows.slice(0, 3).map((row) => row.slice(0, 60).map((cell) => cell.slice(0, 40))) } : {}),
    }),
  })
  const result = await response.json() as { mapping?: Mapping; error?: { message?: string } }
  if (!response.ok || !result.mapping) throw new Error(result.error?.message ?? 'Gemini could not match the columns. You can choose them yourself.')
  return result.mapping
}
