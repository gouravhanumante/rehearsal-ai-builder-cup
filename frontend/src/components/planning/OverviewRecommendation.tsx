import { ArrowRight, ShieldCheck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { RecoveryPlan } from '../../data/demoDistributor'
import { distributorRecoveryPlans } from '../../domain/rehearseDistributor'

type OverviewRecommendationProps = {
  approvedPlan: string | null
  onApprove: (plan: RecoveryPlan) => void
  onViewOptions: () => void
}

export function OverviewRecommendation({ approvedPlan, onApprove, onViewOptions }: OverviewRecommendationProps) {
  const plan = distributorRecoveryPlans.find((item) => item.id === 'transfer')
  if (!plan) return null

  return (
    <section className="overview-recommendation" aria-labelledby="recommendation-title">
      <div className="recommendation-icon"><ShieldCheck size={19} /></div>
      <div className="recommendation-main">
        <div className="recommendation-title"><p className="section-kicker">BEST FIT FOR PROTECTING THE PRIORITY ORDER</p><StatusBadge tone="success" dot>{plan.statusLabel}</StatusBadge></div>
        <h2 id="recommendation-title">{plan.title}</h2>
        <p>{plan.detail}</p>
        <div className="recommendation-outcome"><strong>{plan.impact}</strong><span>{plan.cost}</span></div>
      </div>
      <div className="recommendation-actions">
        {approvedPlan === plan.id
          ? <span className="approved-label"><ShieldCheck size={15} /> Approved for demo</span>
          : <Button onClick={() => onApprove(plan)} variant="primary">Approve plan</Button>}
        <Button className="all-options-link" icon={<ArrowRight size={14} />} onClick={onViewOptions} variant="quiet">Compare all options</Button>
      </div>
    </section>
  )
}
