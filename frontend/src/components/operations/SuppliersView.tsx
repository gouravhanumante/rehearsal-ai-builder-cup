import { ArrowRight, CircleCheck, CircleHelp, Truck } from 'lucide-react'
import { StatusBadge } from '../../design-system/StatusBadge'
import { distributorDemo } from '../../data/distributorDemo'

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })
}

export function SuppliersView() {
  const { alternativeSupplier, shipment } = distributorDemo
  return (
    <section className="data-view" aria-labelledby="suppliers-title">
      <div className="section-heading data-view-heading">
        <div><p className="section-kicker">SUPPLIERS · INBOUND UPDATES</p><h2 id="suppliers-title">Supplier commitments</h2><p className="data-view-description">Confirmed dates are separate from requests that still need an answer.</p></div>
      </div>
      <div className="supplier-list">
        <article className="supplier-row supplier-confirmed">
          <div className="supplier-icon"><Truck size={18} /></div>
          <div className="supplier-main"><div className="supplier-title"><h3>{shipment.supplier}</h3><StatusBadge tone="success" dot>Update confirmed</StatusBadge></div><p>{shipment.id} · {shipment.cases} cases of {distributorDemo.product.name}</p></div>
          <div className="supplier-dates"><span>Previous arrival</span><strong>{formatDate(shipment.originalArrivalAt)}</strong><ArrowRight size={15} /><span>Confirmed arrival</span><strong className="supplier-late-date">{formatDate(shipment.confirmedArrivalAt)}</strong></div>
          <div className="supplier-source"><CircleCheck size={15} /><span>{shipment.updateSource}<small>Today, {shipment.updatedAt}</small></span></div>
        </article>
        <article className="supplier-row supplier-unconfirmed">
          <div className="supplier-icon"><Truck size={18} /></div>
          <div className="supplier-main"><div className="supplier-title"><h3>{alternativeSupplier.name}</h3><StatusBadge tone="warning" dot>Needs information</StatusBadge></div><p>Possible emergency supply for the Thursday commitments.</p></div>
          <div className="supplier-unknowns"><span><CircleHelp size={14} /> Stock availability</span><span><CircleHelp size={14} /> Price</span><span><CircleHelp size={14} /> Arrival time</span></div>
          <p className="supplier-note">This supplier option stays conditional until all three facts are confirmed.</p>
        </article>
      </div>
      <p className="sample-data-note">Supplier details shown here are illustrative sample data.</p>
    </section>
  )
}
