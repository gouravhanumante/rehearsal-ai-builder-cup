import { parseCsv } from './csv'

export type Table = { fileName: string; headers: string[]; rows: string[][] }

export const MAX_IMPORT_BYTES = 20 * 1024 * 1024
export const MAX_IMPORT_ROWS = 100_000

/** A spreadsheet cell as plain text. Dates have no time zone in a sheet, so they are read as written. */
export function cellText(cell: unknown): string {
  if (cell === null || cell === undefined) return ''
  if (cell instanceof Date) {
    const pad = (value: number) => String(value).padStart(2, '0')
    const date = `${cell.getUTCFullYear()}-${pad(cell.getUTCMonth() + 1)}-${pad(cell.getUTCDate())}`
    const hasTime = cell.getUTCHours() !== 0 || cell.getUTCMinutes() !== 0
    return hasTime ? `${date} ${pad(cell.getUTCHours())}:${pad(cell.getUTCMinutes())}` : date
  }
  return String(cell).trim()
}

/** First non-empty row is the header; fully blank rows are dropped. */
export function toTable(fileName: string, grid: unknown[][]): Table {
  const rows = grid.map((row) => row.map(cellText)).filter((row) => row.some((cell) => cell !== ''))
  const [headers = [], ...body] = rows
  return { fileName, headers: headers.map((header, index) => header || `Column ${index + 1}`), rows: body }
}

export async function readTable(file: File): Promise<Table> {
  if (file.size > MAX_IMPORT_BYTES) throw new Error('That file is over 20 MB. Split it into smaller files.')
  const name = file.name.slice(0, 120)
  const lower = name.toLowerCase()
  let table: Table
  if (lower.endsWith('.csv') || lower.endsWith('.tsv') || lower.endsWith('.txt')) {
    table = toTable(name, parseCsv(await file.text()))
  } else if (lower.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser')
    table = toTable(name, await readSheet(file) as unknown[][])
  } else {
    throw new Error('Use a .csv or .xlsx file. For an older .xls file, save it as .xlsx first.')
  }
  if (table.headers.length === 0 || table.rows.length === 0) throw new Error('The file has no rows to import.')
  if (table.rows.length > MAX_IMPORT_ROWS) throw new Error(`That file has more than ${MAX_IMPORT_ROWS.toLocaleString('en')} rows. Split it into smaller files.`)
  return table
}
