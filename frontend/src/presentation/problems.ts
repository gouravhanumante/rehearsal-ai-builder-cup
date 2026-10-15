import type { Workspace } from '../../../shared/planner/model'
import { rankPlans, recommendPlan, type ImpactGroup, type Plan, type Rehearsal } from '../../../shared/planner/plan'
import type { Wording } from './planText'

export type Problem = { group: ImpactGroup; options: Plan[]; best: Plan | undefined; title: string }

const sameProblem = (plan: Plan, group: ImpactGroup) =>
  plan.disruptionId === group.disruptionId && plan.productId === group.productId && plan.locationId === group.locationId

/** One entry per problem (a late delivery or a shortage, for one product at one place), its options best first. */
export function problemsOf(workspace: Workspace, rehearsal: Rehearsal, words: Wording): Problem[] {
  return rehearsal.impact.groups
    .map((group) => {
      const options = rankPlans(rehearsal.plans.filter((plan) => sameProblem(plan, group)), workspace.goal)
      const shipment = workspace.shipments.find((item) => item.id === group.shipmentId)
      const product = words.productName(group.productId)
      const where = words.locationName(group.locationId)
      const title = group.kind === 'delay' ? `Late delivery from ${shipment?.supplierName ?? 'a supplier'} · ${product} at ${where}` : `Not enough ${product} at ${where}`
      return { group, options, best: recommendPlan(options, workspace.goal), title }
    })
    .filter(({ group, options }) => group.exposedQuantity > 0 || options.length > 0)
}
