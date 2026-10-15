import type { Workspace } from '../../../shared/planner/model'
import { sampleWorkspace } from '../../../shared/planner/sample'
import { parseWorkspace } from '../../../shared/planner/validate'

const STORAGE_KEY = 'rehearsal.demo.v3'
// Sample edits saved before stock was kept as movements; they are not carried over.
const OLD_KEYS = ['rehearsal.demo.v1', 'rehearsal.demo.v2']

export type LoadResult = { workspace: Workspace; notice: string | null }

/** Saved edits come from browser storage, so check them; never drop them without saying so. */
export function readSaved(current: string | null): LoadResult {
  if (!current) return { workspace: sampleWorkspace, notice: null }
  const parse = (raw: string) => { try { return JSON.parse(raw) as unknown } catch { return undefined } }
  const workspace = parseWorkspace(parse(current))
  if (workspace) return { workspace, notice: null }
  return { workspace: sampleWorkspace, notice: 'Your saved edits could not be read, so the sample data was loaded instead.' }
}

export function loadDemo(): LoadResult {
  OLD_KEYS.forEach((key) => localStorage.removeItem(key))
  return readSaved(localStorage.getItem(STORAGE_KEY))
}

export function saveDemo(workspace: Workspace) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace))
}

export function clearDemo() {
  localStorage.removeItem(STORAGE_KEY)
}

/** Another tab saved or reset; hand back what is now stored so this tab does not overwrite it. */
export function onDemoChangedElsewhere(apply: (workspace: Workspace) => void) {
  const handle = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY || event.key === null) apply(readSaved(event.newValue).workspace)
  }
  window.addEventListener('storage', handle)
  return () => window.removeEventListener('storage', handle)
}
