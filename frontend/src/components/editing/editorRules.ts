import type { Evidence } from '../../../../shared/planner/model'
import type { FieldSpec, ParsedValue } from './editorConfigs'

/** Where a value in the open editor came from since it opened. */
export type Origin = 'unchanged' | 'typed' | 'document'

export function originAfterTyping(value: string, initialValue: string | undefined): Origin {
  return value === initialValue ? 'unchanged' : 'typed'
}

/** What the form shows when it opens: the saved values, with any pre-filled suggestion already counting as a change. */
export function openingState(fields: FieldSpec[], initial: Record<string, string>, prefilled: Record<string, string> = {}) {
  const values = { ...initial, ...prefilled }
  const origin: Record<string, Origin> = Object.fromEntries(fields.map((field) => [field.key, originAfterTyping(values[field.key] ?? '', initial[field.key])]))
  return { values, origin }
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

/** What the review step shows: for a new record, every detail being saved (preselected choices too); for an edit, only what changed. */
export function reviewFieldKeys(
  isNew: boolean,
  fields: FieldSpec[],
  values: Record<string, string>,
  initial: Record<string, string>,
  origin: Record<string, Origin>,
  initialEvidence: Record<string, Evidence | null>,
) {
  if (!isNew) return changedFieldKeys(fields, values, initial, origin, initialEvidence)
  return fields.filter((field) => (values[field.key] ?? '').trim() !== '').map((field) => field.key)
}
