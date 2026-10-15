import { useState } from 'react'
import { PackageCheck, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { InboundShipment } from '../../../../shared/planner/model'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type Props = {
  shipment: InboundShipment
  onResolve: (outcomes: { productId: string; fate: 'returned' | 'lost' }[]) => string | null
  onClose: () => void
}

export function ResolveTransferDialog({ shipment, onResolve, onClose }: Props) {
  const { words } = useWorkspaceView()
  useEscapeKey(onClose)
  const [fates, setFates] = useState<Record<string, 'returned' | 'lost' | undefined>>({})
  const [error, setError] = useState<string | null>(null)
  const ready = shipment.lines.every((line) => fates[line.productId] !== undefined)
  const resolve = () => {
    if (!ready) return
    const result = onResolve(shipment.lines.map((line) => ({ productId: line.productId, fate: fates[line.productId]! })))
    setError(result)
    if (!result) onClose()
  }

  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="transfer-fate-title" aria-modal="true" className="approval-dialog receive-dialog" role="dialog">
        <header>
          <div><h2 id="transfer-fate-title">Resolve missing transfer goods</h2><p>{shipment.id} · {words.locationName(shipment.fromLocationId ?? '')} to {words.locationName(shipment.locationId)}</p></div>
          <Button aria-label="Close" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">These goods left the source but are not expected to arrive. Record what happened; a loss never returns stock, and a return adds stock only when physically received.</p>
        <ul className="receive-lines">
          {shipment.lines.map((line) => (
            <li key={line.productId}>
              <label><strong>{words.productName(line.productId)}</strong><small>{words.quantity(line.quantity, line.productId)} unresolved</small></label>
              <fieldset className="receive-rest">
                <legend>What happened?</legend>
                <label><input checked={fates[line.productId] === 'returned'} name={`fate-${line.productId}`} onChange={() => setFates({ ...fates, [line.productId]: 'returned' })} type="radio" /> Physically returned to {words.locationName(shipment.fromLocationId ?? '')}</label>
                <label><input checked={fates[line.productId] === 'lost'} name={`fate-${line.productId}`} onChange={() => setFates({ ...fates, [line.productId]: 'lost' })} type="radio" /> Lost or damaged</label>
              </fieldset>
            </li>
          ))}
        </ul>
        {error && <p className="receive-error" role="alert">{error}</p>}
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button disabled={!ready} icon={<PackageCheck size={15} />} onClick={resolve} variant="primary">Save resolution</Button>
        </footer>
      </section>
    </div>
  )
}
