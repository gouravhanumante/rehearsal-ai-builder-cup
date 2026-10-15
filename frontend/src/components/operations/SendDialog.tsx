import { useState } from 'react'
import { PackageCheck, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { Order, OrderLine } from '../../../../shared/planner/model'
import { newId, remainingLines, sentLines } from '../../../../shared/planner/ledger'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type SendDialogProps = {
  order: Order
  /** `splitAllowed` is the customer's answer, given here when it was not known yet. */
  onSend: (lines: OrderLine[], actionId: string, splitAllowed: boolean | undefined) => void
  onClose: () => void
}

const readCount = (text: string) => (/^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null)

/** What is leaving now. All of what is left is the default; sending less needs the customer's yes to parts. */
export function SendDialog({ order, onSend, onClose }: SendDialogProps) {
  const { workspace, words } = useWorkspaceView()
  useEscapeKey(onClose)
  // One id per opened dialog, so a double click or retry records the send once.
  const [actionId] = useState(() => newId('DSP'))
  const remaining = remainingLines(workspace, order)
  const sent = sentLines(workspace, order.id)
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(remaining.map((line) => [line.productId, String(line.quantity)])))
  const [answer, setAnswer] = useState<boolean | undefined>(order.splitAllowed)

  const sending = remaining.map((line) => ({ line, count: readCount(counts[line.productId] ?? '') }))
  const unreadable = sending.some((item) => item.count === null)
  const tooMany = sending.find((item) => item.count !== null && item.count > item.line.quantity)
  const total = sending.reduce((sum, item) => sum + (item.count ?? 0), 0)
  const onHand = (productId: string) => workspace.stock.find((record) => record.locationId === order.locationId && record.productId === productId)?.available.value ?? 0
  const notEnough = sending.find((item) => (item.count ?? 0) > onHand(item.line.productId))
  const partial = sending.some((item) => (item.count ?? 0) < item.line.quantity)
  const blockedBySplit = partial && answer !== true
  const canSend = !unreadable && !tooMany && !notEnough && total > 0 && !blockedBySplit

  const send = () => {
    if (!canSend) return
    onSend(sending.map((item) => ({ productId: item.line.productId, quantity: item.count ?? 0 })), actionId, answer)
  }

  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="send-title" aria-modal="true" className="approval-dialog receive-dialog" role="dialog">
        <header>
          <div><h2 id="send-title">Send {order.customer}'s order</h2><p>{order.id} · from {words.locationName(order.locationId)}{sent.length > 0 ? ` · already sent ${sent.map((line) => words.quantity(line.quantity, line.productId)).join(', ')}` : ''}</p></div>
          <Button aria-label="Cancel" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">Enter what is leaving the warehouse now. It comes off {words.locationName(order.locationId)}'s stock; anything not sent stays on the order.</p>
        <ul className="receive-lines">
          {remaining.map((line) => (
            <li key={line.productId}>
              <label htmlFor={`send-${line.productId}`}><strong>{words.productName(line.productId)}</strong><small>Still to send {words.quantity(line.quantity, line.productId)} · {words.quantity(onHand(line.productId), line.productId)} counted</small></label>
              <input id={`send-${line.productId}`} inputMode="numeric" onChange={(event) => setCounts({ ...counts, [line.productId]: event.target.value })} value={counts[line.productId] ?? ''} />
            </li>
          ))}
        </ul>
        {unreadable && <p className="receive-error" role="alert">Enter a whole number for each product (0 if none is going now).</p>}
        {tooMany && <p className="receive-error" role="alert">That is more {words.productName(tooMany.line.productId)} than the order still needs ({words.quantity(tooMany.line.quantity, tooMany.line.productId)}).</p>}
        {!tooMany && notEnough && <p className="receive-error" role="alert">Only {words.quantity(onHand(notEnough.line.productId), notEnough.line.productId)} of {words.productName(notEnough.line.productId)} counted at {words.locationName(order.locationId)}. Correct the count in Inventory first.</p>}
        {!unreadable && total === 0 && <p className="receive-error" role="alert">Enter what is being sent.</p>}
        {partial && total > 0 && <fieldset className="receive-rest">
          <legend>{order.splitAllowed === undefined ? `Does ${order.customer} accept part now and the rest later?` : `${order.customer} said ${order.splitAllowed ? 'parts are fine' : 'they want it all at once'}. Still true?`}</legend>
          <label><input checked={answer === true} name="split" onChange={() => setAnswer(true)} type="radio" /> Yes, parts are fine</label>
          <label><input checked={answer === false} name="split" onChange={() => setAnswer(false)} type="radio" /> No, they want it all at once</label>
        </fieldset>}
        {partial && total > 0 && answer === false && <p className="receive-error" role="alert">{order.customer} wants the order in one delivery. Wait until all of it can go.</p>}
        {partial && total > 0 && answer === true && <p className="receive-note">The rest stays on the order, still due on its original date.</p>}
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button disabled={!canSend} icon={<PackageCheck size={15} />} onClick={send} variant="primary">{partial ? 'Send part' : 'Send'}</Button>
        </footer>
      </section>
    </div>
  )
}
