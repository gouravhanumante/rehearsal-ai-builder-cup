import { ArrowDownToLine, Boxes, FileUp, PencilLine, Warehouse } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { DistributorData } from '../../data/distributorDemo'
import { formatDateTime } from '../../lib/istTime'
import { EvidenceMark } from '../evidence/EvidenceMark'

type InventoryViewProps = {
  data: DistributorData
  onEdit: (mode: 'manual' | 'document') => void
}

export function InventoryView({ data, onEdit }: InventoryViewProps) {
  const { product, shipment, warehouses } = data
  const { northCases, southUnallocatedCases } = data.inventory
  return (
    <section className="data-view" aria-labelledby="inventory-title">
      <div className="section-heading data-view-heading">
        <div><p className="section-kicker">INVENTORY · {product.name}</p><h2 id="inventory-title">Stock by warehouse</h2><p className="data-view-description">Available stock for {product.pack}.</p></div>
        <div className="data-view-actions">
          <Button icon={<PencilLine size={14} />} onClick={() => onEdit('manual')} variant="secondary">Edit counts</Button>
          <Button icon={<FileUp size={14} />} onClick={() => onEdit('document')} variant="secondary">Attach count sheet</Button>
        </div>
      </div>
      <div className="inventory-grid">
        <article className="inventory-location">
          <div className="location-heading"><span className="location-icon"><Warehouse size={17} /></span><div><h3>{warehouses.north.name}</h3><p>Primary distribution hub</p></div><StatusBadge tone="warning" dot>Under pressure</StatusBadge></div>
          <div className="inventory-quantity"><strong>{northCases.value}</strong><span>cases on hand</span><EvidenceMark evidence={northCases.evidence} /></div>
          <div className="inventory-inbound"><ArrowDownToLine size={15} /><span><strong>{shipment.cases} cases inbound</strong><small>From {shipment.supplier} · {formatDateTime(shipment.confirmedArrivalAt)}</small></span></div>
          <div className="inventory-capacity"><span>Transfer receiving limit</span><strong>{warehouses.north.receivingLimitPerDay} cases / day</strong></div>
        </article>
        <article className="inventory-location">
          <div className="location-heading"><span className="location-icon"><Warehouse size={17} /></span><div><h3>{warehouses.south.name}</h3><p>Secondary distribution hub</p></div><StatusBadge tone={southUnallocatedCases.value > 0 ? 'success' : 'neutral'} dot>{southUnallocatedCases.value > 0 ? 'Available' : 'Empty'}</StatusBadge></div>
          <div className="inventory-quantity"><strong>{southUnallocatedCases.value}</strong><span>unallocated cases</span><EvidenceMark evidence={southUnallocatedCases.evidence} /></div>
          <div className="inventory-inbound inventory-inbound-neutral"><Boxes size={15} /><span><strong>Available to transfer</strong><small>No orders currently allocated to these cases.</small></span></div>
          <div className="inventory-capacity"><span>Product</span><strong>{product.name} · {product.pack}</strong></div>
        </article>
      </div>
      <p className="sample-data-note">Stock you type in is marked unverified. Attach a count sheet or goods receipt to verify it.</p>
    </section>
  )
}
