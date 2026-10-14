import { ArrowRight, CircleCheck, FileUp, PencilLine, Plus, Truck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { MAX_ALTERNATIVE_SUPPLIERS, type DistributorData, type Fact } from '../../data/distributorDemo'
import type { Rehearsal } from '../../domain/rehearseDistributor'
import { formatDateTime } from '../../lib/istTime'
import { EvidenceMark } from '../evidence/EvidenceMark'

type SuppliersViewProps = {
  data: DistributorData
  rehearsal: Rehearsal
  onEdit: (supplierId: string, mode: 'manual' | 'document') => void
  onAdd: () => void
}

const toneFor = (status: string | undefined) => (status === 'ready' ? 'success' : status === 'rejected' ? 'danger' : 'warning')

function FactLine<T>({ label, fact, format }: { label: string; fact: Fact<T>; format: (value: T) => string }) {
  return (
    <div className="supplier-fact">
      <span>{label}</span>
      <strong className={fact.value === null ? 'is-unknown' : ''}>{fact.value === null ? 'Unknown' : format(fact.value)}</strong>
      {fact.value !== null && <EvidenceMark evidence={fact.evidence} />}
    </div>
  )
}

export function SuppliersView({ data, rehearsal, onEdit, onAdd }: SuppliersViewProps) {
  const { shipment, suppliers } = data
  const atLimit = suppliers.length >= MAX_ALTERNATIVE_SUPPLIERS
  return (
    <section className="data-view" aria-labelledby="suppliers-title">
      <div className="section-heading data-view-heading">
        <div><p className="section-kicker">SUPPLIERS · INBOUND UPDATES</p><h2 id="suppliers-title">Supplier commitments</h2><p className="data-view-description">Confirmed dates are separate from details that still need an answer.</p></div>
        <div className="data-view-actions">
          <Button disabled={atLimit} icon={<Plus size={15} />} onClick={onAdd} title={atLimit ? `Up to ${MAX_ALTERNATIVE_SUPPLIERS} backup suppliers` : undefined} variant="primary">Add supplier</Button>
        </div>
      </div>
      <div className="supplier-list">
        <article className="supplier-row supplier-confirmed">
          <div className="supplier-icon"><Truck size={18} /></div>
          <div className="supplier-main"><div className="supplier-title"><h3>{shipment.supplier}</h3><StatusBadge tone="success" dot>Update confirmed</StatusBadge></div><p>{shipment.id} · {shipment.cases} cases of {data.product.name}</p></div>
          <div className="supplier-dates"><span>Previous arrival</span><strong>{formatDateTime(shipment.originalArrivalAt)}</strong><ArrowRight size={15} /><span>Confirmed arrival</span><strong className="supplier-late-date">{formatDateTime(shipment.confirmedArrivalAt)}</strong></div>
          <div className="supplier-source"><CircleCheck size={15} /><span>{shipment.updateSource}<small>Today, {shipment.updatedAt}</small></span></div>
        </article>
        {suppliers.map((supplier) => {
          const plan = rehearsal.plans.find((item) => item.supplierId === supplier.id)
          return (
            <article className={`supplier-row supplier-alternative supplier-${plan?.status ?? 'conditional'}`} key={supplier.id}>
              <div className="supplier-icon"><Truck size={18} /></div>
              <div className="supplier-main">
                <div className="supplier-title"><h3>{supplier.name}</h3><StatusBadge tone={toneFor(plan?.status)} dot>{plan?.statusLabel ?? 'Needs information'}</StatusBadge></div>
                <p>Backup supply · {plan?.detail}</p>
              </div>
              <div className="supplier-facts">
                <FactLine fact={supplier.availableCases} format={(value) => `${value} cases`} label="Stock available" />
                <FactLine fact={supplier.pricePerCase} format={(value) => `$${value} / case`} label="Price" />
                <FactLine fact={supplier.arrivalAt} format={formatDateTime} label="Arrival" />
              </div>
              <div className="supplier-actions">
                <Button icon={<PencilLine size={14} />} onClick={() => onEdit(supplier.id, 'manual')} variant="secondary">Type details</Button>
                <Button icon={<FileUp size={14} />} onClick={() => onEdit(supplier.id, 'document')} variant="secondary">Attach quote</Button>
              </div>
            </article>
          )
        })}
      </div>
      <p className="sample-data-note">Typed-in details are usable but marked unverified. Attach a quote or receipt to verify them.</p>
    </section>
  )
}
