import { ArrowDownToLine, Boxes, Warehouse } from 'lucide-react'
import { StatusBadge } from '../../design-system/StatusBadge'
import { distributorDemo } from '../../data/distributorDemo'

function arrivalDate() {
  return new Date(distributorDemo.shipment.confirmedArrivalAt).toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

export function InventoryView() {
  return (
    <section className="data-view" aria-labelledby="inventory-title">
      <div className="section-heading data-view-heading">
        <div><p className="section-kicker">INVENTORY · {distributorDemo.product.name}</p><h2 id="inventory-title">Stock by warehouse</h2><p className="data-view-description">Available stock for {distributorDemo.product.pack}.</p></div>
      </div>
      <div className="inventory-grid">
        <article className="inventory-location">
          <div className="location-heading"><span className="location-icon"><Warehouse size={17} /></span><div><h3>{distributorDemo.warehouses.north.name}</h3><p>Primary distribution hub</p></div><StatusBadge tone="warning" dot>Under pressure</StatusBadge></div>
          <div className="inventory-quantity"><strong>{distributorDemo.inventory.northCases}</strong><span>cases on hand</span></div>
          <div className="inventory-inbound"><ArrowDownToLine size={15} /><span><strong>{distributorDemo.shipment.cases} cases inbound</strong><small>From {distributorDemo.shipment.supplier} · {arrivalDate()}</small></span></div>
          <div className="inventory-capacity"><span>Transfer receiving limit</span><strong>{distributorDemo.warehouses.north.receivingLimitPerDay} cases / day</strong></div>
        </article>
        <article className="inventory-location">
          <div className="location-heading"><span className="location-icon"><Warehouse size={17} /></span><div><h3>{distributorDemo.warehouses.south.name}</h3><p>Secondary distribution hub</p></div><StatusBadge tone="success" dot>Available</StatusBadge></div>
          <div className="inventory-quantity"><strong>{distributorDemo.inventory.southUnallocatedCases}</strong><span>unallocated cases</span></div>
          <div className="inventory-inbound inventory-inbound-neutral"><Boxes size={15} /><span><strong>Available to transfer</strong><small>No orders currently allocated to these cases.</small></span></div>
          <div className="inventory-capacity"><span>Product</span><strong>{distributorDemo.product.name} · {distributorDemo.product.pack}</strong></div>
        </article>
      </div>
      <p className="sample-data-note">Illustrative inventory snapshot · sample data only</p>
    </section>
  )
}
