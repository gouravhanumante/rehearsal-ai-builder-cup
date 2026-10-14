import type { ReactNode } from 'react'
import { ChevronDown, ChevronUp, PencilLine, Warehouse } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { DemoOrder, DistributorData } from '../../data/distributorDemo'
import type { Rehearsal } from '../../domain/rehearseDistributor'
import { formatDay, formatTime } from '../../lib/istTime'
import { EvidenceMark } from '../evidence/EvidenceMark'

type CommitmentsPanelProps = {
  data: DistributorData
  rehearsal: Rehearsal
  showAll: boolean
  onToggleAll?: () => void
  onEditOrder?: (orderId: string) => void
}

const avatarTones = ['green', 'blue', 'yellow'] as const
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')

export function CommitmentsPanel({ data, rehearsal, showAll, onToggleAll, onEditOrder }: CommitmentsPanelProps) {
  const { impact } = rehearsal
  const affected = showAll ? impact.northAllocations : impact.northAllocations.slice(0, 2)
  const unaffected = showAll ? data.orders.filter((order) => impact.unaffectedOrderIds.includes(order.id)) : []
  const editable = Boolean(onEditOrder)

  const row = (order: DemoOrder, cells: { atHub: string; badge: ReactNode }) => (
    <div className={`order-row ${editable ? 'order-row--editable' : ''}`} key={order.id}>
      <div className="order-customer">
        <span className={`customer-avatar avatar-${avatarTones[data.orders.indexOf(order) % avatarTones.length]}`}>{initialsOf(order.customer)}</span>
        <span><strong>{order.customer}</strong><small>{order.id} · {order.priority === 'protected' ? 'Priority' : 'Standard'}</small>{showAll && <EvidenceMark evidence={order.evidence} />}</span>
      </div>
      <div className="order-due">{formatDay(order.dueAt)}<small>{formatTime(order.dueAt)}</small></div>
      <strong className="order-quantity">{order.cases} cases</strong>
      <span className="order-available">{cells.atHub}</span>
      {cells.badge}
      {onEditOrder && <Button aria-label={`Edit ${order.id}`} className="order-edit" icon={<PencilLine size={14} />} onClick={() => onEditOrder(order.id)} variant="quiet">Edit</Button>}
    </div>
  )

  return (
    <section className="orders-section" aria-labelledby="orders-title">
      <div className="section-heading">
        <div><p className="section-kicker">{showAll ? 'CUSTOMER ORDERS' : 'IMPACTED CUSTOMER ORDERS'}</p><h2 id="orders-title">{impact.affectedOrderCount} {impact.affectedOrderCount === 1 ? 'delivery needs' : 'deliveries need'} attention</h2></div>
        {onToggleAll && <Button className="expand-orders" icon={showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />} onClick={onToggleAll} variant="quiet">
          {showAll ? 'Show fewer' : `View all ${data.orders.length} orders`}
        </Button>}
      </div>
      <div className="orders-table">
        <div className={`orders-table-head ${editable ? 'order-row--editable' : ''}`}><span>Customer</span><span>Due</span><span>Order</span><span>At {data.warehouses.north.name}</span><span>Status</span>{editable && <span />}</div>
        {affected.map((allocation) => {
          const order = data.orders.find((item) => item.id === allocation.orderId)
          if (!order) return null
          const atRisk = allocation.availableCases < order.cases
          return row(order, { atHub: `${allocation.availableCases} cases`, badge: <StatusBadge tone={atRisk ? 'danger' : 'success'} dot>{atRisk ? 'At risk' : 'Covered'}</StatusBadge> })
        })}
      </div>
      {unaffected.length > 0 && <>
        <p className="orders-subheading">Due after {data.shipment.id} arrives · not part of this shortage</p>
        <div className="orders-table">
          {unaffected.map((order) => row(order, { atHub: '—', badge: <StatusBadge tone="neutral" dot>Due after arrival</StatusBadge> }))}
        </div>
      </>}
      <div className="capacity-note"><Warehouse size={16} /><span><strong>{data.warehouses.north.name} receiving limit</strong> {data.warehouses.north.receivingLimitPerDay} cases/day</span><span className="capacity-separator" /><span>{data.inventory.southUnallocatedCases.value} unallocated cases at {data.warehouses.south.name}</span></div>
    </section>
  )
}
