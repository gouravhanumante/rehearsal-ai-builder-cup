import type { Workspace } from '../../../shared/planner/model'
import { sliceForPlan } from '../../../shared/planner/slice'

export type PlanCheck = { ready: boolean; status: string; unverified: number; openConflicts: number }

/** Asks the server to re-run the planner on just the data this plan reads. Throws if it cannot be reached. */
export async function checkPlanOnServer(workspace: Workspace, planId: string): Promise<PlanCheck> {
  const slice = sliceForPlan(workspace, planId)
  if (!slice) throw new Error('Plan is not in the current workspace')
  const response = await fetch('/api/plans/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspace: slice, planId }),
  })
  if (!response.ok) throw new Error(`Plan check failed (${response.status})`)
  return response.json() as Promise<PlanCheck>
}
