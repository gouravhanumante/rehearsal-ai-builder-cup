import { ArrowRight, CircleHelp, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { recommendPlan, type Plan } from '../../../../shared/planner/plan'
import { useWorkspaceView } from '../../presentation/workspaceView'

type OverviewRecommendationProps = {
  onApprove: (plan: Plan) => void
  onViewOptions: () => void
}

export function OverviewRecommendation({ onApprove, onViewOptions }: OverviewRecommendationProps) {
  const { workspace, rehearsal, words } = useWorkspaceView()
  const plan = recommendPlan(rehearsal.plans)
  const openConflicts = rehearsal.conflicts.filter((conflict) => !conflict.decided).length
  const approval = workspace.approval

  if (!plan) {
    return (
      <section className="overview-recommendation overview-recommendation--empty" aria-labelledby="recommendation-title">
        <div className="recommendation-icon"><CircleHelp size={19} /></div>
        <div className="recommendation-main">
          <p className="section-kicker">NO OPTION IS READY YET</p>
          <h2 id="recommendation-title">Add the missing details to check more options</h2>
          <p>None of the recovery options can be confirmed with the details we have.</p>
        </div>
        <div className="recommendation-actions"><Button icon={<ArrowRight size={14} />} onClick={onViewOptions} variant="primary">See options</Button></div>
      </section>
    )
  }

  const text = words.planText(plan)
  const unverified = plan.unverified.length > 0
  return (
    <section className="overview-recommendation" aria-labelledby="recommendation-title">
      <div className="recommendation-icon">{unverified ? <TriangleAlert size={19} /> : <ShieldCheck size={19} />}</div>
      <div className="recommendation-main">
        <div className="recommendation-title"><p className="section-kicker">BEST FIT FOR PROTECTING THE PRIORITY ORDER</p><StatusBadge tone={unverified ? 'warning' : 'success'} dot>{text.statusLabel}</StatusBadge></div>
        <h2 id="recommendation-title">{text.title}</h2>
        <p>{text.detail}</p>
        <div className="recommendation-outcome"><strong>{text.impact}</strong><span>{text.cost}</span></div>
        {openConflicts > 0 && <p className="recommendation-conflicts"><TriangleAlert size={13} /> {openConflicts} stock conflict{openConflicts === 1 ? ' needs' : 's need'} your answer. <button onClick={onViewOptions} type="button">Answer now</button></p>}
      </div>
      <div className="recommendation-actions">
        {approval?.planId === plan.id
          ? <span className="approved-label"><ShieldCheck size={15} /> Approved for demo{approval.withWarning ? ' · with warning' : ''}</span>
          : <Button onClick={() => onApprove(plan)} variant="primary">Approve plan</Button>}
        <Button className="all-options-link" icon={<ArrowRight size={14} />} onClick={onViewOptions} variant="quiet">Compare all options</Button>
      </div>
    </section>
  )
}
