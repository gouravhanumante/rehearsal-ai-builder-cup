import { useState } from 'react'
import { PackageCheck, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { InboundShipment, OrderLine } from '../../../../shared/planner/model'
import { newId } from '../../../../shared/planner/ledger'
import { localToIso } from '../../../../shared/planner/time'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type ReceiveDialogProps = {
  shipment: InboundShipment
  onReceive: (received: OrderLine[], rest: { arrivalAt: string } | null, actionId: string) => void
  onReportLate: () => void
  onClose: () => void
}

const readCount = (text: string) => (/^\d{1,7}$/.test(text.trim()) ? Number(text.trim()) : null)

/** What actually arrived. Part missing: is the rest still coming, and when? Nothing is guessed. */
export function ReceiveDialog({ shipment, onReceive, onReportLate, onClose }: ReceiveDialogProps) {
  const { workspace, format, words } = useWorkspaceView()
  useEscapeKey(onClose)
  const [actionId] = useState(() => newId('RCV'))
  const [counts, setCounts] = useState<Record<string, string>>(() => Object.fromEntries(shipment.lines.map((line) => [line.productId, String(line.quantity)])))
  const [restComing, setRestComing] = useState<'yes' | 'no' | null>(null)
  const [restAt, setRestAt] = useState('')
  const [nothingComing, setNothingComing] = useState(false)

  const arrived = shipment.lines.map((line) => ({ line, got: readCount(counts[line.productId] ?? '') }))
  const unreadable = arrived.some((item) => item.got === null)
  const missing = arrived.filter((item) => item.got !== null && item.got < item.line.quantity)
  const missingText = missing.map((item) => `${words.quantity(item.line.quantity - (item.got ?? 0), item.line.productId)} of ${words.productName(item.line.productId)}`).join(' and ')
  const total = arrived.reduce((sum, item) => sum + (item.got ?? 0), 0)
  const restIso = restAt ? localToIso(restAt, workspace.settings.timeZone) : null
  const needsAnswer = missing.length > 0 && !nothingComing && (restComing === null || (restComing === 'yes' && !restIso))
  const canSave = !unreadable && !needsAnswer && (total > 0 || (nothingComing && !shipment.fromLocationId))

  const save = () => {
    if (!canSave) return
    onReceive(arrived.map((item) => ({ productId: item.line.productId, quantity: item.got ?? 0 })), missing.length > 0 && restComing === 'yes' && restIso ? { arrivalAt: restIso } : null, actionId)
  }

  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="receive-title" aria-modal="true" className="approval-dialog receive-dialog" role="dialog">
        <header>
          <div><h2 id="receive-title">Mark {shipment.id} received</h2><p>{shipment.supplierName} · to {words.locationName(shipment.locationId)} · expected {format.dateTime(shipment.confirmedArrivalAt)}</p></div>
          <Button aria-label="Cancel" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">Enter what actually arrived. It is added to {words.locationName(shipment.locationId)}'s stock, and this delivery stops counting as incoming.</p>
        <ul className="receive-lines">
          {shipment.lines.map((line) => (
            <li key={line.productId}>
              <label htmlFor={`receive-${line.productId}`}><strong>{words.productName(line.productId)}</strong><small>Expected {words.quantity(line.quantity, line.productId)}</small></label>
              <input id={`receive-${line.productId}`} inputMode="numeric" onChange={(event) => setCounts({ ...counts, [line.productId]: event.target.value })} value={counts[line.productId] ?? ''} />
            </li>
          ))}
        </ul>
        {unreadable && <p className="receive-error" role="alert">Enter a whole number for each product (0 if none came).</p>}
        {!unreadable && total === 0 && <p className="receive-error" role="alert">Nothing arrived? <button className="link-button" onClick={onReportLate} type="button">Report it late instead</button>.</p>}
        {!unreadable && total === 0 && !shipment.fromLocationId && <fieldset className="receive-rest">
          <legend>Is this delivery cancelled?</legend>
          <label><input checked={nothingComing} onChange={(event) => setNothingComing(event.target.checked)} type="checkbox" /> Nothing arrived and nothing else will arrive</label>
        </fieldset>}
        {missing.length > 0 && total > 0 && <fieldset className="receive-rest">
          <legend>Are the other {missingText} still coming?</legend>
          <label><input checked={restComing === 'yes'} name="rest" onChange={() => setRestComing('yes')} type="radio" /> Yes, they are still coming</label>
          {restComing === 'yes' && <label className="receive-rest-when">When? ({workspace.settings.timeZone})<input onChange={(event) => setRestAt(event.target.value)} type="datetime-local" value={restAt} /></label>}
          <label><input checked={restComing === 'no'} name="rest" onChange={() => setRestComing('no')} type="radio" /> No, that is all that will come</label>
        </fieldset>}
        {shipment.repeatEveryDays && <p className="receive-note">This is a regular delivery. This receipt is for the one due {format.dateTime(shipment.confirmedArrivalAt)}; the next one stays expected on its usual schedule.</p>}
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button disabled={!canSave} icon={<PackageCheck size={15} />} onClick={save} variant="primary">{nothingComing ? 'Close cancelled delivery' : 'Add to stock'}</Button>
        </footer>
      </section>
    </div>
  )
}
