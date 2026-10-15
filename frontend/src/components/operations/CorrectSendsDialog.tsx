import { useState } from 'react'
import { Save, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { Order } from '../../../../shared/planner/model'
import { effectiveMovements } from '../../../../shared/planner/ledger'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type CorrectSendsDialogProps = {
  order: Order
  /** Returns a message when the correction cannot be saved. */
  onSave: (changes: { movementId: string; quantity: number }[]) => string | null
  onClose: () => void
}

const readCount = (text: string) => (/^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null)

/** Fixes what was recorded as sent, one send at a time. Goods that physically came back are a return, not a correction. */
export function CorrectSendsDialog({ order, onSave, onClose }: CorrectSendsDialogProps) {
  const { workspace, format, words } = useWorkspaceView()
  useEscapeKey(onClose)
  const sends = effectiveMovements(workspace.movements).filter((movement) => movement.kind === 'dispatch' && movement.orderId === order.id)
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(sends.map((send) => [send.id, String(send.quantity)])))
  const [error, setError] = useState<string | null>(null)

  const changes = sends.flatMap((send) => {
    const count = readCount(counts[send.id] ?? '')
    return count !== null && count !== send.quantity ? [{ movementId: send.id, quantity: count }] : []
  })
  const unreadable = sends.some((send) => readCount(counts[send.id] ?? '') === null)

  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="correct-title" aria-modal="true" className="approval-dialog receive-dialog" role="dialog">
        <header>
          <div><h2 id="correct-title">Correct what was sent</h2><p>{order.customer} · {order.id}</p></div>
          <Button aria-label="Cancel" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">Change a number only if it was recorded wrong. The difference goes back to, or comes off, that warehouse's stock, unless a stock count was taken after the send: the count already includes what really left.</p>
        <ul className="receive-lines">
          {sends.map((send) => (
            <li key={send.id}>
              <label htmlFor={`correct-${send.id}`}><strong>{words.productName(send.productId)}</strong><small>Sent {format.dateTime(send.at)} from {words.locationName(send.locationId)}</small></label>
              <input id={`correct-${send.id}`} inputMode="numeric" onChange={(event) => { setCounts({ ...counts, [send.id]: event.target.value }); setError(null) }} value={counts[send.id] ?? ''} />
            </li>
          ))}
        </ul>
        {unreadable && <p className="receive-error" role="alert">Enter a whole number for each send (0 if nothing actually left).</p>}
        {error && <p className="receive-error" role="alert">{error}</p>}
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button disabled={unreadable || changes.length === 0} icon={<Save size={15} />} onClick={() => setError(onSave(changes))} variant="primary">Save correction</Button>
        </footer>
      </section>
    </div>
  )
}
