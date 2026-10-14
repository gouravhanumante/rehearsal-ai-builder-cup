import { importKinds, type ImportKind } from '../../../shared/import/fields'

export type Mapping = Record<string, number | null>

const simplify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, '')

/** Matches column headings to fields by their usual names. Each column is used at most once. */
export function autoMatch(kind: ImportKind, headers: string[]): Mapping {
  const simple = headers.map(simplify)
  const used = new Set<number>()
  const mapping: Mapping = {}
  const fields = importKinds[kind].fields
  for (const field of fields) mapping[field.key] = null
  for (const pass of ['exact', 'contains'] as const) {
    for (const field of fields) {
      if (mapping[field.key] !== null) continue
      const found = simple.findIndex((header, index) => !used.has(index) && header !== '' && field.aliases.some((alias) =>
        pass === 'exact' ? header === alias : alias.length >= 4 && header.includes(alias)))
      if (found >= 0) { mapping[field.key] = found; used.add(found) }
    }
  }
  return mapping
}

export const missingRequired = (kind: ImportKind, mapping: Mapping) =>
  importKinds[kind].fields.filter((field) => field.required && mapping[field.key] === null)
