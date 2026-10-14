import { Check, CircleHelp, CircleX, LifeBuoy, MapPin, PackagePlus, PencilLine, ShieldCheck, TriangleAlert, Truck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { rankPlans, type ImpactGroup, type Plan } from '../../../../shared/planner/plan'
import type { EditTarget } from '../../presentation/planText'
import { openQuestions } from '../../presentation/questions'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { AskSuppliers } from './AskSuppliers'
import { ConflictCards } from './ConflictCards'

type RecoveryPlansProps = {
  onApprove: (plan: Plan) => void
  onAddDetails: (target: EditTarget, mode?: 'manual' | 'document') => void
  onDecideConflict: (conflictId: string, winner: 'earliest-due' | 'priority') => void
  onRuleOutTransfer: (fromLocationId: string, toLocationId: string) => void
  onAnswerDelivery: (fromLocationId: string, forLocationId: string, canDeliver: boolean) => void
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

export function RecoveryPlans({ onApprove, onAddDetails, onDecideConflict, onRuleOutTransfer, onAnswerDelivery }: RecoveryPlansProps) {
  const { workspace, rehearsal, words } = useWorkspaceView()
  const { plans } = rehearsal
  const approval = workspace.approval
  const approved = plans.find((plan) => plan.id === approval?.planId)
  const offerIndexOf = (supplierId: string, plan: Plan) => Math.max(0, workspace.suppliers.find((item) => item.id === supplierId)?.offers
    .findIndex((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId) ?? 0)
  const questions = openQuestions(workspace, rehearsal)
  const customers = (orderIds: string[]) => {
    const names = orderIds.map((id) => words.customer(id))
    return names.length <= 2 ? names.join(' and ') : `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  }
  // One block per problem (a late delivery or a shortage, for one product at one place), each with its own options best first.
  const sameIssue = (plan: Plan, group: ImpactGroup) => plan.disruptionId === group.disruptionId && plan.productId === group.productId && plan.locationId === group.locationId
  const issues = rehearsal.impact.groups
    .map((group) => ({ group, options: rankPlans(plans.filter((plan) => sameIssue(plan, group))) }))
    .filter(({ group, options }) => group.exposedQuantity > 0 || options.length > 0)

  const card = (plan: Plan, index: number) => {
    const text = words.planText(plan)
    const target = detailsTarget(plan, offerIndexOf)
    return (
      <article className={`recovery-option option-${plan.status} ${approval?.planId === plan.id ? 'option-approved' : ''}`} key={plan.id}>
        <div className="option-topline"><span className="option-number">{String(index + 1).padStart(2, '0')}{index === 0 && plan.status === 'ready' && <span className="option-best">Best for this problem</span>}</span><StatusBadge dot tone={toneForStatus(plan)}>{text.statusLabel}</StatusBadge></div>
        <h3>{text.title}</h3>
        <p className="option-description">{text.description}</p>
        <div className={`option-reason reason-${plan.status}`}><IconForStatus status={plan.status} /><span>{text.detail}</span></div>
        {plan.status === 'ready' && plan.unverified.length > 0 && <p className="option-unverified"><TriangleAlert size={13} /> Uses {plan.unverified.length} typed-in {plan.unverified.length === 1 ? 'detail' : 'details'}</p>}
        <div className="option-footer"><div><strong>{text.impact}</strong><small>{text.cost}</small></div>
          {approval?.planId === plan.id
            ? <span className="approved-label">{approval.withWarning ? <TriangleAlert size={15} /> : <Check size={15} />} Approved</span>
            : plan.status === 'ready'
              ? <Button onClick={() => onApprove(plan)} variant="primary">Approve</Button>
              : plan.reason.code === 'ship-from-ask' && plan.sourceLocationId
                ? <span className="option-answer">
                  <Button onClick={() => onAnswerDelivery(plan.sourceLocationId!, plan.locationId, true)} variant="primary">Yes, it can</Button>
                  <Button onClick={() => onAnswerDelivery(plan.sourceLocationId!, plan.locationId, false)} variant="secondary">No</Button>
                </span>
              : target
                ? <Button icon={<PencilLine size={14} />} onClick={() => onAddDetails(target)} variant="secondary">{plan.kind === 'supplier' ? 'Record reply' : 'Add details'}</Button>
                : <Button disabled variant="secondary">Can&apos;t be done</Button>}
        </div>
      </article>
    )
  }

  return (
    <section className="options-section" aria-labelledby="options-title">
      <div className="section-heading options-heading">
        <div><p className="section-kicker">REHEARSAL · {issues.length} {issues.length === 1 ? 'PROBLEM' : 'PROBLEMS'} · {plans.length} OPTIONS CHECKED</p><h2 id="options-title">Recovery options</h2></div>
        <p className="check-note"><ShieldCheck size={16} /> We checked stock, delivery times, receiving and storage limits</p>
      </div>
      <ConflictCards onDecide={onDecideConflict} />
      {questions.deliveries.map(({ from, forLocation, orderIds }) => (
        <div className="no-options-note route-question" key={`deliver|${from}|${forLocation}`}>
          <MapPin size={20} />
          <span><strong>Can {words.placeName(from)} deliver to {words.placeName(forLocation)}'s customers?</strong>{' '}
            It has enough to send {customers(orderIds)}'s {orderIds.length === 1 ? 'order' : 'orders'} instead. Only you know if it can reach them.
          </span>
          <span className="no-options-actions">
            <Button icon={<Check size={14} />} onClick={() => onAnswerDelivery(from, forLocation, true)} variant="primary">Yes, it can</Button>
            <Button onClick={() => onAnswerDelivery(from, forLocation, false)} variant="secondary">No</Button>
          </span>
        </div>
      ))}
      {questions.routes.map(({ from, to, productId, quantity }) => (
        <div className="no-options-note route-question" key={`${from}|${to}`}>
          <Truck size={20} />
          <span><strong>Can you move stock from {words.placeName(from)} to {words.placeName(to)}?</strong>{' '}
            {words.locationName(from)} can spare {words.quantity(quantity, productId)} of {words.productName(productId)} after its own orders. If you can, add how long it takes and Rehearsal will check it.
          </span>
          <span className="no-options-actions">
            <Button icon={<Truck size={14} />} onClick={() => onAddDetails({ type: 'new-route', fromLocationId: from, toLocationId: to })} variant="primary">Yes, add transfer</Button>
            <Button onClick={() => onRuleOutTransfer(from, to)} variant="secondary">No</Button>
          </span>
        </div>
      ))}
      {approved && approval && <div className={`approval-notice ${approval.withWarning ? 'approval-notice--warning' : ''}`}>
        {approval.withWarning ? <TriangleAlert size={16} /> : <Check size={16} />}
        <span><strong>{words.planText(approved).title} approved for this demo{approval.withWarning ? ' with a warning' : ''}.</strong>{approval.defaultedConflicts > 0 ? ` Earliest due was used for ${approval.defaultedConflicts} unanswered conflict${approval.defaultedConflicts === 1 ? '' : 's'}.` : ''} No business records were changed.</span>
      </div>}
      {plans.length === 0 && rehearsal.impact.groups.length === 0 && <p className="editor-empty">Nothing to rehearse: no delay reported and every order is covered by stock or recorded deliveries.</p>}
      {issues.map(({ group, options }, issueIndex) => {
        const shipment = workspace.shipments.find((item) => item.id === group.shipmentId)
        const product = words.productName(group.productId)
        const where = words.locationName(group.locationId)
        const shortOrders = group.allocations.filter((item) => item.covered < item.ordered).map((item) => item.orderId)
        return (
          <section aria-labelledby={`issue-${issueIndex}`} className="issue-block" key={`${group.disruptionId}|${group.productId}|${group.locationId}`}>
            <header className="issue-head">
              <span className="issue-count">{issues.length > 1 ? `Problem ${issueIndex + 1} of ${issues.length}` : 'Problem'}</span>
              <h3 id={`issue-${issueIndex}`}>{group.kind === 'delay' ? `Late delivery from ${shipment?.supplierName ?? 'a supplier'} · ${product} at ${where}` : `Not enough ${product} at ${where}`}</h3>
              <p><strong>{words.quantity(group.exposedQuantity, group.productId)} short</strong>{shortOrders.length > 0 && ` · ${customers(shortOrders)}`} · {options.length} {options.length === 1 ? 'option' : 'options'} checked</p>
            </header>
            {options.length === 0 && <div className="no-options-note">
              <TriangleAlert size={14} />
              <span><strong>No way to fix this yet.</strong>{' '}
                Is a supplier already bringing some? Add that delivery and the order may be covered. Or add a backup supplier to ask.
              </span>
              <span className="no-options-actions">
                <Button icon={<PackagePlus size={14} />} onClick={() => onAddDetails({ type: 'new-shipment', productId: group.productId, locationId: group.locationId })} variant="primary">Add expected delivery</Button>
                <Button icon={<LifeBuoy size={14} />} onClick={() => onAddDetails({ type: 'new-supplier', productId: group.productId, locationId: group.locationId })} variant="secondary">Add backup supplier</Button>
              </span>
            </div>}
            {options.length > 0 && <div className="recovery-options">{options.map(card)}</div>}
          </section>
        )
      })}
      <AskSuppliers onRecordReply={onAddDetails} />
    </section>
  )
}
