import { ChevronDown, ChevronUp, Warehouse } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { distributorDemo } from '../../data/distributorDemo'
import { distributorImpact } from '../../domain/rehearseDistributor'

type CommitmentsPanelProps = {
  showAll: boolean
  onToggleAll?: () => void
}

export function CommitmentsPanel({ showAll, onToggleAll }: CommitmentsPanelProps) {
  const visibleOrders = showAll ? distributorImpact.northAllocations : distributorImpact.northAllocations.slice(0, 2)

  return (
    <section className="orders-section" aria-labelledby="orders-title">
      <div className="section-heading">
        <div><p className="section-kicker">IMPACTED CUSTOMER ORDERS</p><h2 id="orders-title">{distributorImpact.affectedOrderCount} deliveries need attention</h2></div>
        {onToggleAll && <Button className="expand-orders" icon={showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />} onClick={onToggleAll} variant="quiet">
          {showAll ? 'Show fewer' : `View all ${distributorImpact.affectedOrderCount}`}
        </Button>}
      </div>
      <div className="orders-table">
        <div className="orders-table-head"><span>Customer</span><span>Due</span><span>Order</span><span>At North Hub</span><span>Status</span></div>
        {visibleOrders.map((allocation) => {
          const order = distributorDemo.orders.find((item) => item.id === allocation.orderId)
          if (!order) return null
          const atRisk = allocation.availableCases < order.cases
          return (
            <div className="order-row" key={order.id}>
              <div className="order-customer"><span className={`customer-avatar avatar-${order.avatar}`}>{order.initials}</span><span><strong>{order.customer}</strong><small>{order.id} · {order.priority === 'protected' ? 'Priority' : 'Standard'}</small></span></div>
              <div className="order-due">{order.dueLabel}{order.dueTime && <small>{order.dueTime}</small>}</div>
              <strong className="order-quantity">{order.cases} cases</strong>
              <span className="order-available">{allocation.availableCases} cases</span>
              <StatusBadge tone={atRisk ? 'danger' : 'success'} dot>{atRisk ? 'At risk' : 'Covered'}</StatusBadge>
            </div>
          )
        })}
      </div>
      <div className="capacity-note"><Warehouse size={16} /><span><strong>North Hub receiving limit</strong> {distributorDemo.warehouses.north.receivingLimitPerDay} cases/day</span><span className="capacity-separator" /><span>{distributorDemo.inventory.southUnallocatedCases} unallocated cases at South Hub</span></div>
    </section>
  )
}
