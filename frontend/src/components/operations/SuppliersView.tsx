import { ArrowRight, CircleCheck, FileUp, PencilLine, Plus, Truck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Fact } from '../../../../shared/planner/model'
import { LIMITS } from '../../../../shared/planner/validate'
import type { EditTarget } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'

type SuppliersViewProps = {
  onEdit: (target: EditTarget, mode: 'manual' | 'document') => void
}

const toneFor = (status: string | undefined) => (status === 'ready' ? 'success' : status === 'rejected' ? 'danger' : 'warning')

function FactLine<T>({ label, fact, show }: { label: string; fact: Fact<T>; show: (value: T) => string }) {
  return (
    <div className="supplier-fact">
      <span>{label}</span>
      <strong className={fact.value === null ? 'is-unknown' : ''}>{fact.value === null ? 'Unknown' : show(fact.value)}</strong>
      {fact.value !== null && <EvidenceMark evidence={fact.evidence} />}
    </div>
  )
}

export function SuppliersView({ onEdit }: SuppliersViewProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const delayed = new Set(workspace.disruptions.map((disruption) => disruption.shipmentId))
  const atLimit = workspace.suppliers.length >= LIMITS.suppliers
  const manyPlaces = workspace.products.length > 1 || workspace.locations.length > 2

  return (
    <section className="data-view" aria-labelledby="suppliers-title">
      <div className="section-heading data-view-heading">
        <div><p className="section-kicker">SUPPLIERS · INBOUND UPDATES</p><h2 id="suppliers-title">Supplier commitments</h2><p className="data-view-description">Confirmed dates are separate from details that still need an answer.</p></div>
        <div className="data-view-actions">
          <Button disabled={atLimit} icon={<Plus size={15} />} onClick={() => onEdit({ type: 'new-supplier' }, 'manual')} variant="primary">Add supplier</Button>
        </div>
      </div>
      <div className="supplier-list">
        {workspace.shipments.map((shipment) => (
          <article className={`supplier-row ${delayed.has(shipment.id) ? 'supplier-confirmed' : ''}`} key={shipment.id}>
            <div className="supplier-icon"><Truck size={18} /></div>
            <div className="supplier-main">
              <div className="supplier-title"><h3>{shipment.supplierName}</h3><StatusBadge tone="success" dot>Update confirmed</StatusBadge></div>
              <p>{shipment.id} · {shipment.lines.map((line) => `${words.quantity(line.quantity, line.productId)} of ${words.productName(line.productId)}`).join(', ')} · to {words.locationName(shipment.locationId)}</p>
            </div>
            <div className="supplier-dates"><span>Previous arrival</span><strong>{format.dateTime(shipment.originalArrivalAt)}</strong><ArrowRight size={15} /><span>Confirmed arrival</span><strong className={delayed.has(shipment.id) ? 'supplier-late-date' : ''}>{format.dateTime(shipment.confirmedArrivalAt)}</strong></div>
            <div className="supplier-source"><CircleCheck size={15} /><span>{shipment.updateSource}<small>{format.dateTime(shipment.evidence.recordedAt)}</small></span></div>
          </article>
        ))}
        {workspace.suppliers.flatMap((supplier) => supplier.offers.map((offer, offerIndex) => {
          const plan = rehearsal.plans.find((item) => item.supplierId === supplier.id && item.productId === offer.productId && item.locationId === offer.locationId)
          const text = plan ? words.planText(plan) : null
          const target = { type: 'offer' as const, supplierId: supplier.id, offerIndex }
          return (
            <article className={`supplier-row supplier-alternative supplier-${plan?.status ?? 'conditional'}`} key={`${supplier.id}-${offerIndex}`}>
              <div className="supplier-icon"><Truck size={18} /></div>
              <div className="supplier-main">
                <div className="supplier-title"><h3>{supplier.name}</h3><StatusBadge tone={toneFor(plan?.status)} dot>{text?.statusLabel ?? 'Not needed now'}</StatusBadge></div>
                <p>Backup supply{manyPlaces ? ` · ${words.productName(offer.productId)} to ${words.locationName(offer.locationId)}` : ''} · {text?.detail ?? 'No current shortage for this product and location.'}</p>
              </div>
              <div className="supplier-facts">
                <FactLine fact={offer.available} label="Stock available" show={(value) => words.quantity(value, offer.productId)} />
                <FactLine fact={offer.pricePerUnit} label="Price" show={(value) => `${format.money(value)} / ${workspace.products.find((item) => item.id === offer.productId)?.unit ?? 'unit'}`} />
                <FactLine fact={offer.arrivalAt} label="Arrival" show={format.dateTime} />
              </div>
              <div className="supplier-actions">
                <Button aria-label={`Type details for ${supplier.name}`} icon={<PencilLine size={14} />} onClick={() => onEdit(target, 'manual')} variant="secondary">Type details</Button>
                <Button aria-label={`Attach quote for ${supplier.name}`} icon={<FileUp size={14} />} onClick={() => onEdit(target, 'document')} variant="secondary">Attach quote</Button>
              </div>
            </article>
          )
        }))}
      </div>
      <p className="sample-data-note">Typed-in details are usable but marked unverified. Attach a quote or receipt to verify them.</p>
    </section>
  )
}
