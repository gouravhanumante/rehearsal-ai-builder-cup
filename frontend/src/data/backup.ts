import type { Workspace } from '../../../shared/planner/model'
import { impossibleSend } from '../../../shared/planner/ledger'
import { parseWorkspace } from '../../../shared/planner/validate'
import { pluralUnit } from '../presentation/format'

const BACKUP_APP = 'rehearsal-backup'

export function backupFileName(workspace: Workspace, now = new Date()) {
  const name = workspace.businessName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace'
  return `rehearsal-${name}-${now.toISOString().slice(0, 10)}.json`
}

export function serializeBackup(workspace: Workspace, now = new Date()) {
  return JSON.stringify({ app: BACKUP_APP, exportedAt: now.toISOString(), workspace })
}

/** A backup file comes from outside the app, so it is checked like any other saved data. */
export function parseBackup(text: string): { workspace: Workspace } | { error: string } {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch { return { error: 'That file is not a Rehearsal backup.' } }
  const candidate = parsed as { app?: unknown; workspace?: unknown } | null
  if (!candidate || candidate.app !== BACKUP_APP) return { error: 'That file is not a Rehearsal backup.' }
  const workspace = parseWorkspace(candidate.workspace)
  if (!workspace) return { error: 'The backup is damaged or from an incompatible version, so it was not restored.' }
  const impossible = impossibleSend(workspace)
  if (impossible?.kind === 'no-order') return { error: `The backup records goods sent for ${impossible.orderId}, but that order is not in it. It was not restored.` }
  if (impossible) {
    const product = workspace.products.find((item) => item.id === impossible.productId)
    const unit = product?.unit ?? 'unit'
    return { error: `The backup says ${impossible.sent} ${pluralUnit(unit, impossible.sent)} of ${product?.name ?? impossible.productId} were sent for ${impossible.orderId}, but that order is for ${impossible.ordered}. It was not restored.` }
  }
  // A restored backup always becomes the user's own workspace, never the shared sample.
  return { workspace: { ...workspace, mode: 'real', approval: workspace.approval } }
}

export function downloadBackup(workspace: Workspace) {
  const blob = new Blob([serializeBackup(workspace)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = backupFileName(workspace)
  document.body.append(link)
  link.click()
  link.remove()
  // Revoking straight away can cancel the download in Safari and Firefox.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
