import { FileUp, LifeBuoy, PencilLine, Plus, Repeat, Settings2, Trash2, TriangleAlert, Truck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Fact } from '../../../../shared/planner/model'
import { LIMITS } from '../../../../shared/planner/validate'
import type { EditTarget } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { repeatLabel } from '../editing/editorConfigs'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { EmptyState } from '../layout/EmptyState'

type SuppliersViewProps = {
  onEdit: (target: EditTarget, mode: 'manual' | 'document') => void
  onRemoveSupplier: (supplierId: string) => void
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

export function SuppliersView({ onEdit, onRemoveSupplier }: SuppliersViewProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const delayed = new Set(workspace.disruptions.map((disruption) => disruption.shipmentId))
  const atLimit = workspace.suppliers.length >= LIMITS.suppliers
  const manyPlaces = workspace.products.length > 1 || workspace.locations.length > 2

  return (
    <div className="suppliers-page">
      <section className="data-view" aria-labelledby="deliveries-title">
        <div className="section-heading data-view-heading">
          <div><p className="section-kicker">STOCK ON ITS WAY</p><h2 id="deliveries-title">Incoming deliveries</h2><p className="data-view-description">What you are expecting, once or on a schedule. Orders count these when checking if they are covered.</p></div>
          <div className="data-view-actions">
            <Button icon={<Plus size={15} />} onClick={() => onEdit({ type: 'new-shipment' }, 'manual')} variant="primary">Add delivery</Button>
          </div>
        </div>
        {workspace.shipments.length === 0
          ? <EmptyState body="Without deliveries recorded, orders only count the stock already in each warehouse." icon={<Truck size={20} />} title="No deliveries recorded">
            <Button icon={<Plus size={15} />} onClick={() => onEdit({ type: 'new-shipment' }, 'manual')} variant="primary">Add delivery</Button>
          </EmptyState>
          : <div className="supplier-list">
            {workspace.shipments.map((shipment) => {
              const late = delayed.has(shipment.id)
              return (
                <article className={`supplier-row delivery-row ${late ? 'delivery-late' : ''}`} key={shipment.id}>
                  <div className="supplier-icon">{shipment.repeatEveryDays ? <Repeat size={18} /> : <Truck size={18} />}</div>
                  <div className="supplier-main">
                    <div className="supplier-title"><h3>{shipment.supplierName}</h3>
                      {late ? <StatusBadge tone="danger" dot>Late</StatusBadge> : shipment.repeatEveryDays ? <StatusBadge tone="success" dot>Regular delivery</StatusBadge> : <StatusBadge tone="neutral" dot>Expected</StatusBadge>}
                    </div>
                    <p>{shipment.lines.map((line) => `${words.quantity(line.quantity, line.productId)} of ${words.productName(line.productId)}`).join(', ')} · to {words.locationName(shipment.locationId)} · {shipment.id}</p>
                    <EvidenceMark evidence={shipment.evidence} />
                  </div>
                  <div className="delivery-when">
                    {shipment.repeatEveryDays && <span>{repeatLabel(shipment.repeatEveryDays)}</span>}
                    <strong className={late ? 'supplier-late-date' : ''}>{shipment.repeatEveryDays ? 'Next ' : 'Arrives '}{format.dateTime(shipment.confirmedArrivalAt)}</strong>
                    {late && <small>Was {format.dateTime(shipment.originalArrivalAt)} · {shipment.updateSource}</small>}
                  </div>
                  <div className="supplier-actions">
                    <Button aria-label={`Report ${shipment.id} late`} icon={<TriangleAlert size={14} />} onClick={() => onEdit({ type: 'report-delay', shipmentId: shipment.id }, 'manual')} variant="secondary">{late ? 'Update delay' : 'Report late'}</Button>
                  </div>
                </article>
              )
            })}
          </div>}
      </section>

      <section className="data-view suppliers-backup" aria-labelledby="suppliers-title">
        <div className="section-heading data-view-heading">
          <div><p className="section-kicker">WHEN THINGS GO WRONG</p><h2 id="suppliers-title">Backup suppliers</h2><p className="data-view-description">Who you can ask for stock when a delivery is late. You ask them, and record their reply, from Recovery options.</p></div>
          <div className="data-view-actions">
            <Button disabled={atLimit} icon={<Plus size={15} />} onClick={() => onEdit({ type: 'new-supplier' }, 'manual')} variant="secondary">Add backup supplier</Button>
          </div>
        </div>
        {workspace.suppliers.length === 0 && <EmptyState body="Add anyone you could buy from in a shortage. You only need their name, contact, product and warehouse." icon={<LifeBuoy size={20} />} title="No backup suppliers yet">
          <Button icon={<Plus size={15} />} onClick={() => onEdit({ type: 'new-supplier' }, 'manual')} variant="secondary">Add backup supplier</Button>
        </EmptyState>}
        <div className="supplier-list">
        {workspace.suppliers.map((supplier) => (
          <article className="supplier-card" key={supplier.id}>
            <header className="supplier-card-head">
              <div className="supplier-icon"><Truck size={18} /></div>
              <div className="supplier-main">
                <div className="supplier-title"><h3>{supplier.name}</h3></div>
                <p>{supplier.contact || 'No contact saved'} · supplies {supplier.offers.map((offer) => words.productName(offer.productId)).join(', ')}</p>
              </div>
              <div className="route-actions">
                <Button aria-label={`Edit ${supplier.name}`} icon={<Settings2 size={14} />} onClick={() => onEdit({ type: 'supplier', supplierId: supplier.id }, 'manual')} variant="secondary">Edit supplier</Button>
                <Button aria-label={`Remove ${supplier.name}`} icon={<Trash2 size={14} />} onClick={() => onRemoveSupplier(supplier.id)} variant="quiet">Remove</Button>
              </div>
            </header>
            {supplier.offers.map((offer, offerIndex) => {
              const plan = rehearsal.plans.find((item) => item.supplierId === supplier.id && item.productId === offer.productId && item.locationId === offer.locationId)
              const text = plan ? words.planText(plan) : null
              const target = { type: 'offer' as const, supplierId: supplier.id, offerIndex }
              const what = words.productName(offer.productId)
              return (
                <div className={`supplier-offer supplier-alternative supplier-${plan?.status ?? 'conditional'}`} key={`${supplier.id}-${offerIndex}`}>
                  <div className="supplier-main">
                    <div className="supplier-title"><strong>{what}{manyPlaces ? ` to ${words.locationName(offer.locationId)}` : ''}</strong><StatusBadge tone={toneFor(plan?.status)} dot>{text?.statusLabel ?? 'Not needed now'}</StatusBadge></div>
                    <p>{text?.detail ?? 'Not needed now. When you are short, ask them from Recovery options.'}</p>
                  </div>
                  <div className="supplier-facts">
                    <FactLine fact={offer.available} label="Can send" show={(value) => words.quantity(value, offer.productId)} />
                    <FactLine fact={offer.pricePerUnit} label="Price" show={(value) => `${format.money(value)} / ${workspace.products.find((item) => item.id === offer.productId)?.unit ?? 'unit'}`} />
                    <FactLine fact={offer.deliveryCharge ?? { value: null, evidence: null }} label="Delivery" show={(value) => value === 0 ? 'Free' : format.money(value)} />
                    <FactLine fact={offer.arrivalAt} label="Arrives" show={format.dateTime} />
                  </div>
                  <div className="supplier-actions">
                    <Button aria-label={`Record reply from ${supplier.name} for ${what}`} icon={<PencilLine size={14} />} onClick={() => onEdit(target, 'manual')} variant="secondary">Record reply</Button>
                    <Button aria-label={`Attach reply from ${supplier.name} for ${what}`} icon={<FileUp size={14} />} onClick={() => onEdit(target, 'document')} variant="secondary">Attach reply</Button>
                  </div>
                </div>
              )
            })}
          </article>
        ))}
        </div>
        <p className="sample-data-note">Typed-in details are usable but marked unverified. Attach a quote or receipt to verify them.</p>
      </section>
    </div>
  )
}
