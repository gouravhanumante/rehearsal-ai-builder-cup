import { useState } from 'react'
import { Copy, FileUp, Mail, PencilLine, Send } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Plan } from '../../../../shared/planner/plan'
import type { EditTarget } from '../../presentation/planText'
import { askMessage, emailOf, mailtoLink } from '../../presentation/supplierAsk'
import { useWorkspaceView } from '../../presentation/workspaceView'

type AskSuppliersProps = {
  onRecordReply: (target: EditTarget, mode: 'manual' | 'document') => void
}

const toneFor = (plan: Plan) => (plan.status === 'ready' ? 'success' : plan.status === 'rejected' ? 'danger' : 'warning')

/** Ask every backup supplier the same question at once, then record each reply so the planner can compare them. */
export function AskSuppliers({ onRecordReply }: AskSuppliersProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const [copied, setCopied] = useState<string | null>(null)
  const supplierPlans = rehearsal.plans.filter((plan) => plan.kind === 'supplier' && plan.request && plan.supplierId)
  if (supplierPlans.length === 0) return null

  const groups = new Map<string, Plan[]>()
  for (const plan of supplierPlans) {
    const key = `${plan.locationId}|${plan.productId}`
    groups.set(key, [...(groups.get(key) ?? []), plan])
  }

  const supplierOf = (plan: Plan) => workspace.suppliers.find((item) => item.id === plan.supplierId)
  const offerTarget = (plan: Plan): EditTarget => {
    const supplier = supplierOf(plan)
    const offerIndex = supplier?.offers.findIndex((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId) ?? 0
    return { type: 'offer', supplierId: plan.supplierId ?? '', offerIndex: Math.max(0, offerIndex) }
  }
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
    } catch {
      setCopied(null)
    }
  }

  return (
    <section className="ask-suppliers" aria-labelledby="ask-suppliers-title">
      <div>
        <p className="section-kicker">BEFORE YOU BUY</p>
        <h3 id="ask-suppliers-title">Ask your backup suppliers</h3>
        <p className="ask-suppliers-intro">Send everyone the same question, then record each reply. The cheapest one that arrives in time is recommended.</p>
      </div>
      {[...groups.entries()].map(([key, plans]) => {
        const request = plans[0].request!
        const product = workspace.products.find((item) => item.id === plans[0].productId)
        const unit = product?.unit ?? 'unit'
        const what = `${words.quantity(request.quantity, plans[0].productId)} of ${words.productName(plans[0].productId)}`
        const to = words.locationName(plans[0].locationId)
        const by = format.dateTime(request.neededBy)
        const subject = `Can you deliver ${what} by ${by}?`
        const message = (greeting: string) => askMessage({ greeting, what, to, by, unit, from: workspace.businessName })
        const waitingEmails = plans.filter((plan) => plan.status === 'conditional').map((plan) => emailOf(supplierOf(plan)?.contact)).filter((email): email is string => email !== null)
        return (
          <div className="ask-group" key={key}>
            <div className="ask-request">
              <strong>{what} to {to} by {by}</strong>
              {plans[0].spaceLeft !== null && request.quantity === plans[0].spaceLeft && <small>Storage there only has room for {words.quantity(request.quantity, plans[0].productId)}, so that is all we ask for.</small>}
              <pre className="ask-message">{message('Hello')}</pre>
              <div className="ask-actions">
                <Button icon={<Copy size={14} />} onClick={() => copy(key, message('Hello'))} variant="secondary">{copied === key ? 'Copied' : 'Copy message'}</Button>
                {waitingEmails.length > 1 && <a className="ds-button ds-button--primary" href={mailtoLink(waitingEmails, subject, message('Hello'))}><Send size={14} /> Email all {waitingEmails.length} waiting</a>}
              </div>
            </div>
            <ul className="ask-list">
              {plans.map((plan) => {
                const supplier = supplierOf(plan)
                const email = emailOf(supplier?.contact)
                const text = words.planText(plan)
                const name = supplier?.name ?? 'Supplier'
                return (
                  <li key={plan.id}>
                    <div className="ask-supplier">
                      <strong>{name}</strong>
                      <small>{supplier?.contact || 'No contact saved'}{plan.status !== 'conditional' ? ` · ${text.cost}` : ''}</small>
                    </div>
                    <StatusBadge dot tone={toneFor(plan)}>{plan.status === 'conditional' ? 'Waiting for reply' : text.statusLabel}</StatusBadge>
                    <div className="ask-row-actions">
                      {email && <a aria-label={`Email ${name}`} className="ds-button ds-button--quiet" href={mailtoLink([email], subject, message(`Hello ${name}`))}><Mail size={13} /> Email</a>}
                      <Button aria-label={`Record reply from ${name}`} icon={<PencilLine size={13} />} onClick={() => onRecordReply(offerTarget(plan), 'manual')} variant="quiet">Record reply</Button>
                      <Button aria-label={`Attach reply from ${name}`} icon={<FileUp size={13} />} onClick={() => onRecordReply(offerTarget(plan), 'document')} variant="quiet">Attach reply</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
