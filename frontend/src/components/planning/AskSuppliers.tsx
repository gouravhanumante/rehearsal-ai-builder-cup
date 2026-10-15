import { useState } from 'react'
import { Copy, FileUp, Mail, PencilLine, Send } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Plan } from '../../../../shared/planner/plan'
import type { EditTarget } from '../../presentation/planText'
import { askMessage, emailOf, mailtoLink, type AskItem } from '../../presentation/supplierAsk'
import { useWorkspaceView } from '../../presentation/workspaceView'

type AskSuppliersProps = {
  /** One problem's options: one product short at one place. */
  plans: Plan[]
  onRecordReply: (target: EditTarget, mode: 'manual' | 'document') => void
}

const toneFor = (plan: Plan) => (plan.status === 'ready' ? 'success' : plan.status === 'rejected' ? 'danger' : 'warning')

/** Ask this problem's backup suppliers the same question, then record each reply so the planner can compare them. */
export function AskSuppliers({ plans, onRecordReply }: AskSuppliersProps) {
  const { workspace, format, words } = useWorkspaceView()
  const [copied, setCopied] = useState(false)
  const asks = plans.filter((plan) => plan.kind === 'supplier' && plan.request && plan.supplierId)
  if (asks.length === 0) return null

  const first = asks[0]
  const item: AskItem = {
    what: `${words.quantity(first.request?.quantity ?? 0, first.productId)} of ${words.productName(first.productId)}`,
    to: words.locationName(first.locationId),
    by: format.dateTime(first.request?.neededBy ?? ''),
    unit: workspace.products.find((product) => product.id === first.productId)?.unit ?? 'unit',
  }
  const message = (greeting: string) => askMessage({ greeting, items: [item], from: workspace.businessName })
  const subject = `Can you deliver ${item.what} by ${item.by}?`
  const supplierOf = (plan: Plan) => workspace.suppliers.find((supplier) => supplier.id === plan.supplierId)
  const waiting = asks.filter((plan) => plan.status === 'conditional')
  const waitingEmails = [...new Set(waiting.map((plan) => emailOf(supplierOf(plan)?.contact)).filter((email): email is string => email !== null))]
  const offerTarget = (plan: Plan): EditTarget => {
    const supplier = supplierOf(plan)
    const offerIndex = supplier?.offers.findIndex((offer) => offer.productId === plan.productId && offer.locationId === plan.locationId) ?? 0
    return { type: 'offer', supplierId: plan.supplierId ?? '', offerIndex: Math.max(0, offerIndex) }
  }
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  const product = words.productName(first.productId)

  return (
    <details className="ask-suppliers">
      <summary className="ask-head">
        <span className="ask-head-icon"><Send size={16} /></span>
        <span className="ask-head-text">
          <strong>Ask suppliers for {product}</strong>
          <small>{waiting.length === 0 ? 'Every supplier has replied' : `${waiting.length} of ${asks.length} waiting for a reply`} · the cheapest reply that arrives in time is recommended</small>
        </span>
      </summary>
      <div className="ask-message-card">
        <pre className="ask-message">{message('Hello')}</pre>
        <div className="ask-actions">
          <Button icon={<Copy size={14} />} onClick={() => copy(message('Hello'))} variant="secondary">{copied ? 'Copied' : 'Copy message'}</Button>
          {waitingEmails.length > 1 && <a className="ds-button ds-button--primary" href={mailtoLink(waitingEmails, subject, message('Hello'))}><Send size={14} /> Email all {waitingEmails.length} waiting</a>}
        </div>
      </div>
      <ul className="ask-list">
        {asks.map((plan) => {
          const supplier = supplierOf(plan)
          const name = supplier?.name ?? 'Supplier'
          const email = emailOf(supplier?.contact)
          const text = words.planText(plan)
          return (
            <li key={plan.id}>
              <div className="ask-supplier-head">
                <span className="ask-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
                <div className="ask-supplier">
                  <strong>{name}</strong>
                  <small>{supplier?.contact || 'No contact saved'}{plan.status !== 'conditional' ? ` · ${text.cost}` : ''}</small>
                  {plan.spaceLeft !== null && plan.request?.quantity === plan.spaceLeft && <small className="ask-storage">Storage there only has room for this many.</small>}
                </div>
                <StatusBadge dot tone={toneFor(plan)}>{plan.status === 'conditional' ? 'Waiting for reply' : text.statusLabel}</StatusBadge>
              </div>
              <div className="ask-row-actions">
                {email && <a aria-label={`Email ${name}`} className="ds-button ds-button--secondary" href={mailtoLink([email], subject, message(`Hello ${name}`))}><Mail size={13} /> Email</a>}
                <Button aria-label={`Record reply from ${name} for ${product}`} icon={<PencilLine size={13} />} onClick={() => onRecordReply(offerTarget(plan), 'manual')} variant={plan.status === 'conditional' ? 'primary' : 'secondary'}>Record reply</Button>
                <Button aria-label={`Attach reply from ${name} for ${product}`} icon={<FileUp size={13} />} onClick={() => onRecordReply(offerTarget(plan), 'document')} variant="secondary">Attach reply</Button>
              </div>
            </li>
          )
        })}
      </ul>
    </details>
  )
}
