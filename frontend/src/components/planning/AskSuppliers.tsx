import { useState } from 'react'
import { Copy, FileUp, Mail, PencilLine, Send } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Plan } from '../../../../shared/planner/plan'
import type { EditTarget } from '../../presentation/planText'
import { askMessage, emailOf, mailtoLink, type AskItem } from '../../presentation/supplierAsk'
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

  const bySupplier = new Map<string, Plan[]>()
  for (const plan of supplierPlans) {
    const key = plan.supplierId ?? ''
    bySupplier.set(key, [...(bySupplier.get(key) ?? []), plan])
  }
  const needs = [...new Map(supplierPlans.map((plan) => [`${plan.locationId}|${plan.productId}`, plan])).values()]

  const itemOf = (plan: Plan): AskItem => ({
    what: `${words.quantity(plan.request?.quantity ?? 0, plan.productId)} of ${words.productName(plan.productId)}`,
    to: words.locationName(plan.locationId),
    by: format.dateTime(plan.request?.neededBy ?? ''),
    unit: workspace.products.find((item) => item.id === plan.productId)?.unit ?? 'unit',
  })
  // Ask for what is still waiting; once everything is answered, the message repeats the full list.
  const askedFor = (plans: Plan[]) => {
    const waiting = plans.filter((plan) => plan.status === 'conditional')
    return (waiting.length ? waiting : plans).map(itemOf)
  }
  const message = (greeting: string, plans: Plan[]) => askMessage({ greeting, items: askedFor(plans), from: workspace.businessName })
  const subject = (plans: Plan[]) => {
    const items = askedFor(plans)
    return items.length === 1 ? `Can you deliver ${items[0].what} by ${items[0].by}?` : `Stock request from ${workspace.businessName}: ${items.length} items`
  }
  // One BCC email only works when every waiting supplier would get the same list.
  const waitingGroups = new Map<string, { plans: Plan[]; emails: string[] }>()
  for (const plans of bySupplier.values()) {
    const email = emailOf(workspace.suppliers.find((item) => item.id === plans[0].supplierId)?.contact)
    if (!email || !plans.some((plan) => plan.status === 'conditional')) continue
    const key = message('Hello', plans)
    const group = waitingGroups.get(key) ?? { plans, emails: [] }
    waitingGroups.set(key, { ...group, emails: [...group.emails, email] })
  }
  const emailAll = waitingGroups.size === 1 ? [...waitingGroups.values()].find((group) => group.emails.length > 1) : undefined

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
      <header className="ask-head">
        <span className="ask-head-icon"><Send size={16} /></span>
        <div>
          <h3 id="ask-suppliers-title">Ask your backup suppliers</h3>
          <p className="ask-suppliers-intro">Each supplier gets one message listing everything you are missing that they supply. Record each reply; the cheapest one that arrives in time is recommended.</p>
        </div>
        {emailAll && <a className="ds-button ds-button--primary ask-email-all" href={mailtoLink(emailAll.emails, subject(emailAll.plans), message('Hello', emailAll.plans))}><Send size={14} /> Email all {emailAll.emails.length} waiting</a>}
      </header>
      <ul className="ask-need">
        {needs.map((plan) => <li key={`${plan.locationId}|${plan.productId}`}>Need <strong>{itemOf(plan).what}</strong> at <strong>{itemOf(plan).to}</strong> by <strong>{itemOf(plan).by}</strong></li>)}
      </ul>
      {[...bySupplier.entries()].map(([supplierId, plans]) => {
        const supplier = workspace.suppliers.find((item) => item.id === supplierId)
        const name = supplier?.name ?? 'Supplier'
        const email = emailOf(supplier?.contact)
        const waiting = plans.filter((plan) => plan.status === 'conditional').length
        const personal = message(`Hello ${name}`, plans)
        return (
          <div className="ask-group" key={supplierId}>
            <div className="ask-supplier-head">
              <span className="ask-avatar" aria-hidden="true">{name.slice(0, 2).toUpperCase()}</span>
              <div className="ask-supplier">
                <strong>{name}</strong>
                <small>{supplier?.contact || 'No contact saved'}</small>
              </div>
              {waiting > 0 && <StatusBadge dot tone="warning">{waiting === plans.length ? 'Waiting for reply' : `${waiting} of ${plans.length} waiting`}</StatusBadge>}
            </div>
            <div className="ask-columns">
              <div className="ask-step">
                <p className="ask-step-label"><span>1</span> Send this message</p>
                <div className="ask-message-card">
                  <pre className="ask-message">{personal}</pre>
                  <div className="ask-actions">
                    <Button icon={<Copy size={14} />} onClick={() => copy(supplierId, personal)} variant="secondary">{copied === supplierId ? 'Copied' : 'Copy message'}</Button>
                    {email && <a aria-label={`Email ${name}`} className="ds-button ds-button--secondary" href={mailtoLink([email], subject(plans), personal)}><Mail size={14} /> Email</a>}
                  </div>
                </div>
              </div>
              <div className="ask-step">
                <p className="ask-step-label"><span>2</span> Record each reply</p>
                <ul className="ask-list">
                  {plans.map((plan) => {
                    const text = words.planText(plan)
                    const item = itemOf(plan)
                    const product = words.productName(plan.productId)
                    return (
                      <li key={plan.id}>
                        <div className="ask-item">
                          <strong>{item.what}</strong>
                          <small>to {item.to} by {item.by}{plan.status !== 'conditional' ? ` · ${text.cost}` : ''}</small>
                          {plan.spaceLeft !== null && plan.request?.quantity === plan.spaceLeft && <small className="ask-storage">Storage there only has room for this many.</small>}
                        </div>
                        <StatusBadge dot tone={toneFor(plan)}>{plan.status === 'conditional' ? 'Waiting for reply' : text.statusLabel}</StatusBadge>
                        <div className="ask-row-actions">
                          <Button aria-label={`Record reply from ${name} for ${product}`} icon={<PencilLine size={13} />} onClick={() => onRecordReply(offerTarget(plan), 'manual')} variant={plan.status === 'conditional' ? 'primary' : 'secondary'}>Record reply</Button>
                          <Button aria-label={`Attach reply from ${name} for ${product}`} icon={<FileUp size={13} />} onClick={() => onRecordReply(offerTarget(plan), 'document')} variant="secondary">Attach reply</Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </div>
            </div>
          </div>
        )
      })}
    </section>
  )
}
