import { Check, CircleHelp, CircleX, PencilLine, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { RecoveryPlan } from '../../data/demoDistributor'
import type { Rehearsal } from '../../domain/rehearseDistributor'

export type Approval = { planId: string; withWarning: boolean }

type RecoveryPlansProps = {
  rehearsal: Rehearsal
  approval: Approval | null
  onApprove: (plan: RecoveryPlan) => void
  onAddDetails: (supplierId: string) => void
}

const toneForStatus = (plan: RecoveryPlan) => {
  if (plan.status === 'ready') return plan.unverifiedFacts.length ? 'warning' : 'success'
  if (plan.status === 'conditional') return 'warning'
  return 'danger'
}

const IconForStatus = ({ status }: { status: RecoveryPlan['status'] }) => {
  if (status === 'ready') return <ShieldCheck size={18} />
  if (status === 'conditional') return <CircleHelp size={18} />
  return <CircleX size={18} />
}

export function RecoveryPlans({ rehearsal, approval, onApprove, onAddDetails }: RecoveryPlansProps) {
  const { plans } = rehearsal
  const approved = plans.find((plan) => plan.id === approval?.planId)

  return (
    <section className="options-section" aria-labelledby="options-title">
      <div className="section-heading options-heading">
        <div><p className="section-kicker">REHEARSAL · {plans.length} OPTIONS CHECKED</p><h2 id="options-title">Recovery options</h2></div>
        <p className="check-note"><ShieldCheck size={16} /> We checked stock, delivery times, and warehouse limits</p>
      </div>
      {approved && <div className={`approval-notice ${approval?.withWarning ? 'approval-notice--warning' : ''}`}>
        {approval?.withWarning ? <TriangleAlert size={16} /> : <Check size={16} />}
        <span><strong>{approved.title} approved for this demo{approval?.withWarning ? ' with unverified details' : ''}.</strong> No business records were changed.</span>
      </div>}
      <div className="recovery-options">
        {plans.map((plan, index) => (
          <article className={`recovery-option option-${plan.status} ${approval?.planId === plan.id ? 'option-approved' : ''}`} key={plan.id}>
            <div className="option-topline"><span className="option-number">{String(index + 1).padStart(2, '0')}</span><StatusBadge dot tone={toneForStatus(plan)}>{plan.statusLabel}</StatusBadge></div>
            <h3>{plan.title}</h3>
            <p className="option-description">{plan.description}</p>
            <div className={`option-reason reason-${plan.status}`}><IconForStatus status={plan.status} /><span>{plan.detail}</span></div>
            {plan.status === 'ready' && plan.unverifiedFacts.length > 0 && <p className="option-unverified"><TriangleAlert size={13} /> Uses {plan.unverifiedFacts.length} typed-in {plan.unverifiedFacts.length === 1 ? 'detail' : 'details'}</p>}
            <div className="option-footer"><div><strong>{plan.impact}</strong><small>{plan.cost}</small></div>
              {approval?.planId === plan.id
                ? <span className="approved-label">{approval.withWarning ? <TriangleAlert size={15} /> : <Check size={15} />} Approved</span>
                : plan.status === 'ready'
                  ? <Button onClick={() => onApprove(plan)} variant="primary">Approve</Button>
                  : plan.status === 'conditional' && plan.supplierId
                    ? <Button icon={<PencilLine size={14} />} onClick={() => onAddDetails(plan.supplierId as string)} variant="secondary">Add details</Button>
                    : <Button disabled variant="secondary">{plan.status === 'rejected' ? "Can't be done" : 'Waiting for details'}</Button>}
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
