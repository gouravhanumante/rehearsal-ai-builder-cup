import { Check, CircleHelp, CircleX, ShieldCheck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { RecoveryPlan } from '../../data/demoDistributor'
import { distributorRecoveryPlans } from '../../domain/rehearseDistributor'

type RecoveryPlansProps = {
  approvedPlan: string | null
  onApprove: (plan: RecoveryPlan) => void
}

const toneForStatus = (status: RecoveryPlan['status']) => {
  if (status === 'ready') return 'success'
  if (status === 'conditional') return 'warning'
  return 'danger'
}

const IconForStatus = ({ status }: { status: RecoveryPlan['status'] }) => {
  if (status === 'ready') return <ShieldCheck size={18} />
  if (status === 'conditional') return <CircleHelp size={18} />
  return <CircleX size={18} />
}

export function RecoveryPlans({ approvedPlan, onApprove }: RecoveryPlansProps) {
  const approved = distributorRecoveryPlans.find((plan) => plan.id === approvedPlan)

  return (
    <section className="options-section" aria-labelledby="options-title">
      <div className="section-heading options-heading">
        <div><p className="section-kicker">REHEARSAL · 3 OPTIONS CHECKED</p><h2 id="options-title">Recovery options</h2></div>
        <p className="check-note"><ShieldCheck size={16} /> We checked stock, delivery times, and warehouse limits</p>
      </div>
      {approved && <div className="approval-notice"><Check size={16} /><span><strong>{approved.title} approved for this demo.</strong> No business records were changed.</span></div>}
      <div className="recovery-options">
        {distributorRecoveryPlans.map((plan, index) => (
          <article className={`recovery-option option-${plan.status} ${approvedPlan === plan.id ? 'option-approved' : ''}`} key={plan.id}>
            <div className="option-topline"><span className="option-number">0{index + 1}</span><StatusBadge dot tone={toneForStatus(plan.status)}>{plan.statusLabel}</StatusBadge></div>
            <h3>{plan.title}</h3>
            <p className="option-description">{plan.description}</p>
            <div className={`option-reason reason-${plan.status}`}><IconForStatus status={plan.status} /><span>{plan.detail}</span></div>
            <div className="option-footer"><div><strong>{plan.impact}</strong><small>{plan.cost}</small></div>
              {approvedPlan === plan.id
                ? <span className="approved-label"><Check size={15} /> Approved</span>
                : plan.status === 'ready'
                  ? <Button onClick={() => onApprove(plan)} variant="primary">Approve</Button>
                  : <Button disabled variant="secondary">{plan.status === 'rejected' ? "Can't be done" : 'Waiting for details'}</Button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
