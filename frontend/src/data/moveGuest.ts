import type { Workspace } from '../../../shared/planner/model'

export type MoveSteps = {
  /** Resolves once any guest save still in progress has finished, so the last edit is included. */
  finishGuestSave: () => Promise<void>
  loadGuest: () => Promise<Workspace | null>
  /** Resolves with the new business id only after the account has confirmed the save. */
  saveToAccount: (workspace: Workspace) => Promise<string>
  clearGuest: () => Promise<void>
}

export type MoveResult =
  | { moved: true; businessId: string; workspace: Workspace; browserCopyLeft: boolean }
  | { moved: false; reason: 'nothing-to-move' }

/** Copies the guest business into the account; the browser copy is removed only after that save succeeds. */
export async function moveGuestToAccount(steps: MoveSteps): Promise<MoveResult> {
  await steps.finishGuestSave()
  const workspace = await steps.loadGuest()
  if (!workspace) return { moved: false, reason: 'nothing-to-move' }
  const businessId = await steps.saveToAccount(workspace)
  try {
    await steps.clearGuest()
    return { moved: true, businessId, workspace, browserCopyLeft: false }
  } catch {
    return { moved: true, businessId, workspace, browserCopyLeft: true }
  }
}
