import { useState } from 'react'
import { PackageCheck, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { InboundShipment, OrderLine } from '../../../../shared/planner/model'
import { newId, transferDepartedLines, transferRemainingLines } from '../../../../shared/planner/ledger'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type Props = {
  shipment: InboundShipment
  onDepart: (lines: OrderLine[], actionId: string) => string | null
  onClose: () => void
}

const readCount = (text: string) => (/^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null)

export function TransferDepartureDialog({ shipment, onDepart, onClose }: Props) {
  const { workspace, words } = useWorkspaceView()
  useEscapeKey(onClose)
  const dialogRef = useDialogFocus<HTMLElement>()
  const [actionId] = useState(() => newId('DEP'))
  const remaining = transferRemainingLines(workspace, shipment.id)
  const departed = transferDepartedLines(workspace, shipment.id)
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(remaining.map((line) => [line.productId, String(line.quantity)])))
  const [error, setError] = useState<string | null>(null)
  const requested = remaining.map((line) => ({ line, count: readCount(counts[line.productId] ?? '') }))
  const invalid = requested.some((item) => item.count === null)
  const tooMany = requested.find((item) => item.count !== null && item.count > item.line.quantity)
  const none = requested.every((item) => item.count === 0)

  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="departure-title" aria-modal="true" className="approval-dialog receive-dialog" ref={dialogRef} role="dialog">
        <header>
          <div><h2 id="departure-title">Record transfer departure</h2><p>{shipment.id} · {words.locationName(shipment.fromLocationId ?? '')} to {words.locationName(shipment.locationId)}</p></div>
          <Button aria-label="Close" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">Booked stock still counts as physically on hand, but cannot be promised elsewhere. Record what actually left; only then does it come off this location's count.</p>
        <p className="receive-note">Already departed: {departed.length ? departed.map((line) => words.quantity(line.quantity, line.productId)).join(', ') : 'nothing yet'}.</p>
        <ul className="receive-lines">
          {remaining.map((line) => {
            const onHand = workspace.stock.find((item) => item.locationId === shipment.fromLocationId && item.productId === line.productId)?.available.value ?? 0
            return <li key={line.productId}>
              <label htmlFor={`transfer-${line.productId}`}><strong>{words.productName(line.productId)}</strong><small>{words.quantity(line.quantity, line.productId)} still booked · {words.quantity(onHand, line.productId)} physically counted</small></label>
              <input id={`transfer-${line.productId}`} inputMode="numeric" onChange={(event) => { setCounts({ ...counts, [line.productId]: event.target.value }); setError(null) }} value={counts[line.productId] ?? ''} />
            </li>
          })}
        </ul>
        {invalid && <p className="receive-error" role="alert">Enter a whole number for each product (0 if none left).</p>}
        {tooMany && <p className="receive-error" role="alert">That is more than the quantity still booked.</p>}
        {none && !invalid && <p className="receive-error" role="alert">Enter the quantity that actually left.</p>}
        {error && <p className="receive-error" role="alert">{error}</p>}
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button disabled={invalid || Boolean(tooMany) || none} icon={<PackageCheck size={15} />} onClick={() => setError(onDepart(requested.map((item) => ({ productId: item.line.productId, quantity: item.count ?? 0 })), actionId))} variant="primary">Record departure</Button>
        </footer>
      </section>
    </div>
  )
}
