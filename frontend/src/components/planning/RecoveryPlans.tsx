import { Check, CircleHelp, CircleX, PencilLine, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Plan } from '../../../../shared/planner/plan'
import type { EditTarget } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { ConflictCards } from './ConflictCards'

type RecoveryPlansProps = {
  onApprove: (plan: Plan) => void
  onAddDetails: (target: EditTarget) => void
  onDecideConflict: (conflictId: string, winner: 'earliest-due' | 'priority') => void
}

const toneForStatus = (plan: Plan) => {
  if (plan.status === 'ready') return plan.unverified.length ? 'warning' : 'success'
  if (plan.status === 'conditional') return 'warning'
  return 'danger'
}

const IconForStatus = ({ status }: { status: Plan['status'] }) => {
  if (status === 'ready') return <ShieldCheck size={18} />
  if (status === 'conditional') return <CircleHelp size={18} />
  return <CircleX size={18} />
}

/** Where to fill in what a "needs information" option is missing. */
function detailsTarget(plan: Plan, offerIndexOf: (supplierId: string, plan: Plan) => number): EditTarget | null {
  if (plan.status !== 'conditional') return null
  if (plan.kind === 'supplier' && plan.supplierId) return { type: 'offer', supplierId: plan.supplierId, offerIndex: offerIndexOf(plan.supplierId, plan) }
  if (plan.routeId) return { type: 'route', routeId: plan.routeId }
  return null
}

export function RecoveryPlans({ onApprove, onAddDetails, onDecideConflict }: RecoveryPlansProps) {
  const { workspace, rehearsal, words } = useWorkspaceView()
  const { plans } = rehearsal
  const approval = workspace.approval
  const approved = plans.find((plan) => plan.id === approval?.planId)
  const offerIndexOf = (supplierId: string, plan: Plan) => Math.max(0, workspace.suppliers.find((item) => item.id === supplierId)?.offers
    .findIndex((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId) ?? 0)

  return (
    <section className="options-section" aria-labelledby="options-title">
      <div className="section-heading options-heading">
        <div><p className="section-kicker">REHEARSAL · {plans.length} OPTIONS CHECKED</p><h2 id="options-title">Recovery options</h2></div>
        <p className="check-note"><ShieldCheck size={16} /> We checked stock, delivery times, and receiving limits</p>
      </div>
      <ConflictCards onDecide={onDecideConflict} />
      {approved && approval && <div className={`approval-notice ${approval.withWarning ? 'approval-notice--warning' : ''}`}>
        {approval.withWarning ? <TriangleAlert size={16} /> : <Check size={16} />}
        <span><strong>{words.planText(approved).title} approved for this demo{approval.withWarning ? ' with a warning' : ''}.</strong>{approval.defaultedConflicts > 0 ? ` Earliest due was used for ${approval.defaultedConflicts} unanswered conflict${approval.defaultedConflicts === 1 ? '' : 's'}.` : ''} No business records were changed.</span>
      </div>}
      {plans.length === 0 && <p className="editor-empty">No options to check: either nothing is short, or a stock count is missing.</p>}
      <div className="recovery-options">
        {plans.map((plan, index) => {
          const text = words.planText(plan)
          const target = detailsTarget(plan, offerIndexOf)
          return (
            <article className={`recovery-option option-${plan.status} ${approval?.planId === plan.id ? 'option-approved' : ''}`} key={plan.id}>
              <div className="option-topline"><span className="option-number">{String(index + 1).padStart(2, '0')}</span><StatusBadge dot tone={toneForStatus(plan)}>{text.statusLabel}</StatusBadge></div>
              <h3>{text.title}</h3>
              <p className="option-description">{text.description}</p>
              <div className={`option-reason reason-${plan.status}`}><IconForStatus status={plan.status} /><span>{text.detail}</span></div>
              {plan.status === 'ready' && plan.unverified.length > 0 && <p className="option-unverified"><TriangleAlert size={13} /> Uses {plan.unverified.length} typed-in {plan.unverified.length === 1 ? 'detail' : 'details'}</p>}
              <div className="option-footer"><div><strong>{text.impact}</strong><small>{text.cost}</small></div>
                {approval?.planId === plan.id
                  ? <span className="approved-label">{approval.withWarning ? <TriangleAlert size={15} /> : <Check size={15} />} Approved</span>
                  : plan.status === 'ready'
                    ? <Button onClick={() => onApprove(plan)} variant="primary">Approve</Button>
                    : target
                      ? <Button icon={<PencilLine size={14} />} onClick={() => onAddDetails(target)} variant="secondary">Add details</Button>
                      : <Button disabled variant="secondary">Can&apos;t be done</Button>}
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
