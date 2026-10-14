import { Check, CircleHelp, CircleX, LifeBuoy, PackagePlus, PencilLine, ShieldCheck, TriangleAlert, Truck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { rankPlans, spareStock, type Plan } from '../../../../shared/planner/plan'
import type { EditTarget } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { AskSuppliers } from './AskSuppliers'
import { ConflictCards } from './ConflictCards'

type RecoveryPlansProps = {
  onApprove: (plan: Plan) => void
  onAddDetails: (target: EditTarget, mode?: 'manual' | 'document') => void
  onDecideConflict: (conflictId: string, winner: 'earliest-due' | 'priority') => void
  onRuleOutTransfer: (fromLocationId: string, toLocationId: string) => void
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

export function RecoveryPlans({ onApprove, onAddDetails, onDecideConflict, onRuleOutTransfer }: RecoveryPlansProps) {
  const { workspace, rehearsal, words } = useWorkspaceView()
  const { plans } = rehearsal
  const approval = workspace.approval
  const approved = plans.find((plan) => plan.id === approval?.planId)
  const offerIndexOf = (supplierId: string, plan: Plan) => Math.max(0, workspace.suppliers.find((item) => item.id === supplierId)?.offers
    .findIndex((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId) ?? 0)
  const shortGroups = rehearsal.impact.groups.filter((group) => (group.exposedQuantity ?? 0) > 0)
  // Another location holds the product but nobody has said whether stock can move from it.
  const routeQuestions = new Map<string, { from: string; to: string; productId: string; quantity: number }>()
  for (const group of shortGroups) {
    for (const record of workspace.stock.filter((item) => item.productId === group.productId && item.locationId !== group.locationId && item.available.value > 0)) {
      const from = record.locationId
      const to = group.locationId
      const spare = spareStock(workspace, from, group.productId)
      const answered = workspace.routes.some((route) => route.fromLocationId === from && route.toLocationId === to)
        || (workspace.noTransfers ?? []).some((pair) => pair.fromLocationId === from && pair.toLocationId === to)
      if (spare > 0 && !answered && !routeQuestions.has(`${from}|${to}`)) routeQuestions.set(`${from}|${to}`, { from, to, productId: group.productId, quantity: spare })
    }
  }

  return (
    <section className="options-section" aria-labelledby="options-title">
      <div className="section-heading options-heading">
        <div><p className="section-kicker">REHEARSAL · {plans.length} OPTIONS CHECKED</p><h2 id="options-title">Recovery options</h2></div>
        <p className="check-note"><ShieldCheck size={16} /> We checked stock, delivery times, receiving and storage limits</p>
      </div>
      <ConflictCards onDecide={onDecideConflict} />
      {[...routeQuestions.values()].map(({ from, to, productId, quantity }) => (
        <div className="no-options-note route-question" key={`${from}|${to}`}>
          <Truck size={20} />
          <span><strong>Can you move stock from {words.locationName(from)} to {words.locationName(to)}?</strong>{' '}
            {words.locationName(from)} can spare {words.quantity(quantity, productId)} of {words.productName(productId)} after its own orders. If you can, add how long it takes and Rehearsal will check it.
          </span>
          <span className="no-options-actions">
            <Button icon={<Truck size={14} />} onClick={() => onAddDetails({ type: 'new-route', fromLocationId: from, toLocationId: to })} variant="primary">Yes, add transfer</Button>
            <Button onClick={() => onRuleOutTransfer(from, to)} variant="secondary">No</Button>
          </span>
        </div>
      ))}
      {shortGroups
        .filter((group) => !plans.some((plan) => plan.locationId === group.locationId && plan.productId === group.productId))
        .map((group) => (
          <div className="no-options-note" key={group.disruptionId}>
            <TriangleAlert size={14} />
            <span><strong>No way to fix {words.productName(group.productId)} at {words.locationName(group.locationId)} yet.</strong>{' '}
              Is a supplier already bringing some? Add that delivery and the order may be covered. Or add a backup supplier to ask.
            </span>
            <span className="no-options-actions">
              <Button icon={<PackagePlus size={14} />} onClick={() => onAddDetails({ type: 'new-shipment', productId: group.productId, locationId: group.locationId })} variant="primary">Add expected delivery</Button>
              <Button icon={<LifeBuoy size={14} />} onClick={() => onAddDetails({ type: 'new-supplier', productId: group.productId, locationId: group.locationId })} variant="secondary">Add backup supplier</Button>
            </span>
          </div>
        ))}
      {approved && approval && <div className={`approval-notice ${approval.withWarning ? 'approval-notice--warning' : ''}`}>
        {approval.withWarning ? <TriangleAlert size={16} /> : <Check size={16} />}
        <span><strong>{words.planText(approved).title} approved for this demo{approval.withWarning ? ' with a warning' : ''}.</strong>{approval.defaultedConflicts > 0 ? ` Earliest due was used for ${approval.defaultedConflicts} unanswered conflict${approval.defaultedConflicts === 1 ? '' : 's'}.` : ''} No business records were changed.</span>
      </div>}
      {plans.length === 0 && rehearsal.impact.groups.length === 0 && <p className="editor-empty">Nothing to rehearse: no delay reported and every order is covered by stock or recorded deliveries.</p>}
      <div className="recovery-options">
        {rankPlans(plans).map((plan, index) => {
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
                      ? <Button icon={<PencilLine size={14} />} onClick={() => onAddDetails(target)} variant="secondary">{plan.kind === 'supplier' ? 'Record reply' : 'Add details'}</Button>
                      : <Button disabled variant="secondary">Can&apos;t be done</Button>}
              </div>
            </article>
          )
        })}
      </div>
      <AskSuppliers onRecordReply={onAddDetails} />
    </section>
  )
}
