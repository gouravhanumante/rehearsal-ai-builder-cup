import { ArrowRight, CircleHelp, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { RecoveryPlan } from '../../data/demoDistributor'
import { recommendPlan, type Rehearsal } from '../../domain/rehearseDistributor'
import type { Approval } from './RecoveryPlans'

type OverviewRecommendationProps = {
  rehearsal: Rehearsal
  approval: Approval | null
  onApprove: (plan: RecoveryPlan) => void
  onViewOptions: () => void
}

export function OverviewRecommendation({ rehearsal, approval, onApprove, onViewOptions }: OverviewRecommendationProps) {
  const plan = recommendPlan(rehearsal.plans)

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

  const unverified = plan.unverifiedFacts.length > 0
  return (
    <section className="overview-recommendation" aria-labelledby="recommendation-title">
      <div className="recommendation-icon">{unverified ? <TriangleAlert size={19} /> : <ShieldCheck size={19} />}</div>
      <div className="recommendation-main">
        <div className="recommendation-title"><p className="section-kicker">BEST FIT FOR PROTECTING THE PRIORITY ORDER</p><StatusBadge tone={unverified ? 'warning' : 'success'} dot>{plan.statusLabel}</StatusBadge></div>
        <h2 id="recommendation-title">{plan.title}</h2>
        <p>{plan.detail}</p>
        <div className="recommendation-outcome"><strong>{plan.impact}</strong><span>{plan.cost}</span></div>
      </div>
      <div className="recommendation-actions">
        {approval?.planId === plan.id
          ? <span className="approved-label"><ShieldCheck size={15} /> Approved for demo{approval.withWarning ? ' · unverified' : ''}</span>
          : <Button onClick={() => onApprove(plan)} variant="primary">Approve plan</Button>}
        <Button className="all-options-link" icon={<ArrowRight size={14} />} onClick={onViewOptions} variant="quiet">Compare all options</Button>
      </div>
    </section>
  )
}
