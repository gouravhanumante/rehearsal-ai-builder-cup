import { ArrowRight, CircleCheck, Package, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'

type IncidentOverviewProps = {
  onReportDelay?: () => void
  onAddShipment?: () => void
  /** Takes a delay off the list once the shipment has arrived. */
  onResolve?: (disruptionId: string) => void
}

export function IncidentOverview({ onReportDelay, onAddShipment, onResolve }: IncidentOverviewProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const { impact } = rehearsal
  const shortages = impact.groups.filter((group) => group.kind === 'shortage')

  if (workspace.disruptions.length === 0 && shortages.length === 0) {
    const watched = workspace.orders.filter((order) => (order.status ?? 'open') === 'open').length
    return (
      <section className="incident-section" aria-label="Disruptions">
        <div className="calm-card">
          <span className="calm-icon"><ShieldCheck size={20} /></span>
          <div className="calm-main">
            <h2>No disruption right now</h2>
            <p>{watched > 0
              ? `Every one of your ${format.number(watched)} open order${watched === 1 ? ' is' : 's is'} covered by stock or recorded deliveries. When a shipment is late, report it and Rehearsal shows who is affected.`
              : 'Add your orders and shipments, and Rehearsal will watch them for you. When a shipment is late, report it here.'}</p>
          </div>
          {workspace.shipments.length > 0
            ? onReportDelay && <Button icon={<TriangleAlert size={15} />} onClick={onReportDelay} variant="primary">Report a delay</Button>
            : onAddShipment && <Button onClick={onAddShipment} variant="secondary">Add a shipment first</Button>}
        </div>
      </section>
    )
  }

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
            {shipment.evidence.kind === 'manual'
              ? <EvidenceMark evidence={shipment.evidence} />
              : <div className="source-confirmed"><CircleCheck size={15} /><span>Confirmed</span></div>}
          </div>
        )
      })}
      {shortages.map((group) => {
        const short = group.allocations.filter((item) => item.covered < item.ordered)
        const customers = short.map((item) => words.customer(item.orderId))
        return (
          <div className="incident-alert" key={group.disruptionId}>
            <span className="incident-alert-icon"><Package size={18} /></span>
            <div className="incident-alert-main">
              <div className="incident-title-line"><h2>Not enough stock</h2><StatusBadge tone="danger" dot>Short</StatusBadge></div>
              <p>{words.productName(group.productId)} at {words.locationName(group.locationId)} · {customers.slice(0, 2).join(', ')}{customers.length > 2 ? ` and ${customers.length - 2} more` : ''} · nothing late, stock and recorded deliveries don’t cover {short.length === 1 ? 'this order' : 'these orders'}</p>
            </div>
            <div className="incident-arrival"><strong>{words.quantity(group.exposedQuantity ?? 0, group.productId)} short</strong></div>
          </div>
        )
      })}
      <div className="impact-strip">
        <div className="impact-stat impact-stat-alert"><span className="impact-icon"><Package size={17} /></span><strong>{format.number(impact.exposedQuantity)}</strong><span>{words.totalUnit(impact.exposedQuantity)} exposed</span></div>
        <div className="impact-stat"><span className="impact-icon"><TriangleAlert size={17} /></span><strong>{impact.affectedOrderIds.length}</strong><span>orders at risk</span></div>
        <p>
          {impact.uncountedGroups > 0
            ? `${impact.uncountedGroups} affected location${impact.uncountedGroups === 1 ? ' has' : 's have'} no stock count, so it counts as 0. Add a count in Inventory if that is wrong.`
            : workspace.disruptions.length > 0 ? 'The delayed stock arrives after these commitments are due.' : 'See the recovery options below, or add stock and deliveries.'}
        </p>
      </div>
      {(onReportDelay || onResolve) && <div className="incident-actions">
        {onReportDelay && <Button icon={<TriangleAlert size={14} />} onClick={onReportDelay} variant="secondary">Report another delay</Button>}
        {onResolve && workspace.disruptions.map((disruption) => <Button icon={<CircleCheck size={14} />} key={disruption.id} onClick={() => onResolve(disruption.id)} variant="quiet">Mark {disruption.id} resolved</Button>)}
      </div>}
    </section>
  )
}
