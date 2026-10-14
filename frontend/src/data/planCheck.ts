import type { Workspace } from '../../../shared/planner/model'

export type PlanCheck = { ready: boolean; status: string; unverified: number; openConflicts: number }

/** Asks the server to re-run the planner on this data. Throws if it cannot be reached. */
export async function checkPlanOnServer(workspace: Workspace, planId: string): Promise<PlanCheck> {
  const response = await fetch('/api/plans/check', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workspace, planId }),
  })
  if (!response.ok) throw new Error(`Plan check failed (${response.status})`)
  return response.json() as Promise<PlanCheck>
}
