import { ArrowRight, CircleCheck, Package, TriangleAlert } from 'lucide-react'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { DistributorData } from '../../data/distributorDemo'
import type { Rehearsal } from '../../domain/rehearseDistributor'

export function IncidentOverview({ data, rehearsal }: { data: DistributorData; rehearsal: Rehearsal }) {
  const { product, shipment } = data
  const distributorImpact = rehearsal.impact
  const originalArrival = new Date(shipment.originalArrivalAt).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'Asia/Kolkata',
  })
  const newArrival = new Date(shipment.confirmedArrivalAt).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  })

  return (
    <section className="incident-section" aria-labelledby="incident-title">
      <div className="incident-alert">
        <span className="incident-alert-icon"><TriangleAlert size={18} /></span>
        <div className="incident-alert-main">
          <div className="incident-title-line"><h2 id="incident-title">Supplier delay</h2><StatusBadge tone="danger" dot>High impact</StatusBadge><span className="incident-id">INC-0248</span></div>
          <p>{shipment.supplier} · {shipment.id} · {product.name}, {product.pack}</p>
        </div>
        <div className="incident-arrival"><span>{originalArrival}</span><ArrowRight size={15} /><strong>{newArrival}</strong></div>
        <div className="source-confirmed"><CircleCheck size={15} /><span>Confirmed</span></div>
      </div>
      <div className="impact-strip">
        <div className="impact-stat impact-stat-alert"><span className="impact-icon"><Package size={17} /></span><strong>{distributorImpact.casesExposed}</strong><span>cases exposed</span></div>
        <div className="impact-stat"><span className="impact-icon"><TriangleAlert size={17} /></span><strong>{distributorImpact.affectedOrderCount}</strong><span>orders at risk</span></div>
        <p>{shipment.cases} cases arrive {newArrival}, after these commitments are due.</p>
      </div>
    </section>
  )
}
