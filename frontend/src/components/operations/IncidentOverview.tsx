import { ArrowRight, CircleCheck, Package, TriangleAlert } from 'lucide-react'
import { StatusBadge } from '../../design-system/StatusBadge'
import { useWorkspaceView } from '../../presentation/workspaceView'

export function IncidentOverview() {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const { impact } = rehearsal

  return (
    <section className="incident-section" aria-label="Disruptions">
      {workspace.disruptions.map((disruption) => {
        const shipment = workspace.shipments.find((item) => item.id === disruption.shipmentId)
        if (!shipment) return null
        const products = shipment.lines.map((line) => {
          const product = workspace.products.find((item) => item.id === line.productId)
          return product ? `${product.name}, ${product.pack}` : line.productId
        }).join(' · ')
        return (
          <div className="incident-alert" key={disruption.id}>
            <span className="incident-alert-icon"><TriangleAlert size={18} /></span>
            <div className="incident-alert-main">
              <div className="incident-title-line"><h2>Supplier delay</h2><StatusBadge tone="danger" dot>High impact</StatusBadge><span className="incident-id">{disruption.id}</span></div>
              <p>{shipment.supplierName} · {shipment.id} · {products} · to {words.locationName(shipment.locationId)}</p>
            </div>
            <div className="incident-arrival"><span>{format.day(shipment.originalArrivalAt)}</span><ArrowRight size={15} /><strong>{format.dateTime(shipment.confirmedArrivalAt)}</strong></div>
            <div className="source-confirmed"><CircleCheck size={15} /><span>Confirmed</span></div>
          </div>
        )
      })}
      <div className="impact-strip">
        <div className="impact-stat impact-stat-alert"><span className="impact-icon"><Package size={17} /></span><strong>{format.number(impact.exposedQuantity)}</strong><span>{words.totalUnit(impact.exposedQuantity)} exposed</span></div>
        <div className="impact-stat"><span className="impact-icon"><TriangleAlert size={17} /></span><strong>{impact.affectedOrderIds.length}</strong><span>orders at risk</span></div>
        <p>
          {impact.unknownGroups > 0
            ? `${impact.unknownGroups} affected location${impact.unknownGroups === 1 ? ' has' : 's have'} no stock count, so exposure there is unknown.`
            : 'The delayed stock arrives after these commitments are due.'}
        </p>
      </div>
    </section>
  )
}
