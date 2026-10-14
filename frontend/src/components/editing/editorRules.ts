import type { Evidence } from '../../data/distributorDemo'
import type { FieldSpec, ParsedValue } from './editorConfigs'

/** Where a value in the open editor came from since it opened. */
export type Origin = 'unchanged' | 'typed' | 'document'

export function originAfterTyping(value: string, initialValue: string | undefined): Origin {
  return value === initialValue ? 'unchanged' : 'typed'
}

/** Evidence saved with a value: the attached document, the keyboard, or whatever it had before. */
export function resolveEvidence(origin: Origin, value: ParsedValue, previous: Evidence | null, documentName: string | null, recordedAt: string): Evidence | null {
  if (value === null) return null
  if (origin === 'document' && documentName) return { kind: 'document', source: documentName, recordedAt }
  if (origin === 'typed' || origin === 'document' || !previous) return { kind: 'manual', source: 'Entered manually', recordedAt }
  return previous
}

/** A field counts as changed if its value changed, or a document now proves a value that was not proven before. */
export function changedFieldKeys(
  fields: FieldSpec[],
  values: Record<string, string>,
  initial: Record<string, string>,
  origin: Record<string, Origin>,
  initialEvidence: Record<string, Evidence | null>,
) {
  return fields
    .filter((field) => (origin[field.key] !== 'unchanged' && values[field.key] !== initial[field.key])
      || (origin[field.key] === 'document' && initialEvidence[field.key]?.kind !== 'document'))
    .map((field) => field.key)
}
