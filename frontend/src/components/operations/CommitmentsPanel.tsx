import { useMemo, type ReactNode } from 'react'
import { Ban, ChevronDown, ChevronUp, ClipboardPlus, FileUp, PackageCheck, PencilLine, RotateCcw, Warehouse } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Order } from '../../../../shared/planner/model'
import { isOpen, orderCoverage } from '../../../../shared/planner/plan'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { EmptyState } from '../layout/EmptyState'

type CommitmentsPanelProps = {
  showAll: boolean
  onToggleAll?: () => void
  onEditOrder?: (orderId: string) => void
  onAddOrder?: () => void
  onImportOrders?: () => void
  /** Delivered / cancel on open orders; reopen on closed ones. */
  onSetStatus?: (orderId: string, status: 'open' | 'delivered' | 'cancelled') => void
  onAddCount?: (locationId: string, productId: string) => void
}

const avatarTones = ['green', 'blue', 'yellow'] as const
const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((word) => word[0]?.toUpperCase()).join('')

export function CommitmentsPanel({ showAll, onToggleAll, onEditOrder, onAddOrder, onImportOrders, onSetStatus, onAddCount }: CommitmentsPanelProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const { impact } = rehearsal
  const editable = Boolean(onEditOrder)
  const rowClass = onSetStatus ? 'order-row--actions' : editable ? 'order-row--editable' : ''
  const noDisruption = impact.groups.length === 0
  const orderById = new Map(workspace.orders.map((order) => [order.id, order]))
  const openOrders = workspace.orders.filter(isOpen)
  const closedOrders = workspace.orders.filter((order) => !isOpen(order))
  const manyProducts = workspace.products.length > 1
  const affectedRows = impact.groups.flatMap((group) => group.allocations
    .filter((allocation) => group.affectedOrderIds.includes(allocation.orderId) || group.watchOrderIds.includes(allocation.orderId))
    .map((allocation) => ({ group, allocation })))
  const visibleRows = showAll ? affectedRows : affectedRows.slice(0, 2)
  const unaffected = showAll || noDisruption ? workspace.orders.filter((order) => impact.unaffectedOrderIds.includes(order.id)) : []
  const affectedCount = impact.affectedOrderIds.length
  const watchCount = impact.watchOrderIds.length
  const coverage = useMemo(() => orderCoverage(workspace), [workspace])

  const row = (key: string, order: Order, cells: { quantity: string; covered: string; badge: ReactNode; note?: string; uncounted?: { locationId: string; productId: string }[] }) => (
    <div className={`order-row ${rowClass} ${isOpen(order) ? '' : 'order-row--closed'}`} key={key}>
      <div className="order-customer">
        <span className={`customer-avatar avatar-${avatarTones[workspace.orders.indexOf(order) % avatarTones.length]}`}>{initialsOf(order.customer)}</span>
        <span><strong>{order.customer}</strong><small>{order.id} · {order.priority === 'protected' ? 'High priority' : 'Standard'} · {words.locationName(order.locationId)}</small>{cells.note && <small className="order-shortage">{cells.note}</small>}
          {cells.uncounted?.map((item) => (
            <small className="order-uncounted" key={`${item.locationId}|${item.productId}`}>
              No stock count for {words.productName(item.productId)} at {words.locationName(item.locationId)}, so it counts as 0.
              {onAddCount && <button onClick={() => onAddCount(item.locationId, item.productId)} type="button">Add count</button>}
            </small>
          ))}
          {showAll && <EvidenceMark evidence={order.evidence} />}</span>
      </div>
      <div className="order-due">{format.day(order.dueAt)}<small>{format.time(order.dueAt)}</small></div>
      <strong className="order-quantity">{cells.quantity}</strong>
      <span className="order-available">{cells.covered}</span>
      {cells.badge}
      {onSetStatus
        ? <div className="order-actions">
          {isOpen(order)
            ? <>
              {onEditOrder && <Button aria-label={`Edit ${order.id}`} icon={<PencilLine size={14} />} onClick={() => onEditOrder(order.id)} variant="quiet">Edit</Button>}
              <Button aria-label={`Mark ${order.id} delivered`} icon={<PackageCheck size={14} />} onClick={() => onSetStatus(order.id, 'delivered')} variant="quiet">Delivered</Button>
              <Button aria-label={`Cancel ${order.id}`} icon={<Ban size={14} />} onClick={() => onSetStatus(order.id, 'cancelled')} variant="quiet">Cancel</Button>
            </>
            : <Button aria-label={`Reopen ${order.id}`} icon={<RotateCcw size={14} />} onClick={() => onSetStatus(order.id, 'open')} variant="quiet">Reopen</Button>}
        </div>
        : onEditOrder && <Button aria-label={`Edit ${order.id}`} className="order-edit" icon={<PencilLine size={14} />} onClick={() => onEditOrder(order.id)} variant="quiet">Edit</Button>}
    </div>
  )

  const routesIn = impact.groups.flatMap((group) => workspace.routes.filter((route) => route.toLocationId === group.locationId).map((route) => ({ group, route })))

  if (openOrders.length === 0 && closedOrders.length === 0) {
    return (
      <section className="orders-section" aria-labelledby="orders-title">
        <div className="section-heading"><div><p className="section-kicker">CUSTOMER ORDERS</p><h2 id="orders-title">No orders yet</h2></div></div>
        <EmptyState body="Add or import your open customer orders. Rehearsal uses them to see who is affected when a shipment is late." icon={<ClipboardPlus size={20} />} title="Nothing to watch yet">
          {onImportOrders && <Button icon={<FileUp size={14} />} onClick={onImportOrders} variant="primary">Import orders</Button>}
          {onAddOrder && <Button icon={<ClipboardPlus size={14} />} onClick={onAddOrder} variant="secondary">Add order</Button>}
        </EmptyState>
      </section>
    )
  }

  return (
    <section className="orders-section" aria-labelledby="orders-title">
      <div className="section-heading">
        <div><p className="section-kicker">{showAll || noDisruption ? 'CUSTOMER ORDERS' : 'IMPACTED CUSTOMER ORDERS'}</p><h2 id="orders-title">{noDisruption ? `${format.number(openOrders.length)} open order${openOrders.length === 1 ? '' : 's'}` : affectedCount > 0 ? `${affectedCount} ${affectedCount === 1 ? 'delivery needs' : 'deliveries need'} attention` : watchCount > 0 ? `No order short · ${watchCount} to watch` : 'No order short'}</h2></div>
        {onImportOrders && <Button icon={<FileUp size={14} />} onClick={onImportOrders} variant="secondary">Import orders</Button>}
        {onAddOrder && <Button icon={<ClipboardPlus size={14} />} onClick={onAddOrder} variant="secondary">Add order</Button>}
        {onToggleAll && <Button className="expand-orders" icon={showAll ? <ChevronUp size={15} /> : <ChevronDown size={15} />} onClick={onToggleAll} variant="quiet">
          {showAll ? 'Show fewer' : `View all ${openOrders.length} orders`}
        </Button>}
      </div>
      <div className="orders-table">
        <div className={`orders-table-head ${rowClass}`}><span>Customer</span><span>Due</span><span>Order</span><span>Covered</span><span>Status</span>{(editable || onSetStatus) && <span />}</div>
        {visibleRows.map(({ group, allocation }) => {
          const order = orderById.get(allocation.orderId)
          if (!order) return null
          const quantity = `${words.quantity(allocation.ordered, group.productId)}${manyProducts ? ` · ${words.productName(group.productId)}` : ''}`
          const atRisk = allocation.covered < allocation.ordered
          return row(`${group.disruptionId}-${group.productId}-${order.id}`, order, {
            quantity,
            covered: words.quantity(allocation.covered, group.productId),
            badge: atRisk
              ? <StatusBadge tone="danger" dot>At risk</StatusBadge>
              : <StatusBadge tone="warning" dot>Watch</StatusBadge>,
            note: atRisk ? undefined : 'Covered only by stock still on its way. If that delivery slips, this order is short.',
            uncounted: group.counted ? [] : [{ locationId: group.locationId, productId: group.productId }],
          })
        })}
      </div>
      {unaffected.length > 0 && <>
        {!noDisruption && <p className="orders-subheading">Not at risk · covered by stock or deliveries, or for other products and locations</p>}
        <div className="orders-table">
          {unaffected.map((order) => {
            const lines = coverage.filter((line) => line.orderId === order.id)
            const short = lines.filter((line) => line.status === 'short')
            return row(order.id, order, {
              quantity: order.lines.map((line) => words.quantity(line.quantity, line.productId)).join(', '),
              covered: lines.map((line) => words.quantity(line.covered, line.productId)).join(', ') || '—',
              badge: short.length > 0
                ? <StatusBadge tone="danger" dot>Short</StatusBadge>
                : <StatusBadge tone="success" dot>Covered</StatusBadge>,
              note: short.map(words.shortageText).join(' · ') || undefined,
              uncounted: lines.filter((line) => !line.counted).map((line) => ({ locationId: line.locationId, productId: line.productId })),
            })
          })}
        </div>
      </>}
      {showAll && closedOrders.length > 0 && <>
        <p className="orders-subheading">Delivered and cancelled · no longer counted</p>
        <div className="orders-table">
          {closedOrders.map((order) => row(order.id, order, {
            quantity: order.lines.map((line) => words.quantity(line.quantity, line.productId)).join(', '),
            covered: order.closedAt ? format.day(order.closedAt) : '—',
            badge: order.status === 'delivered' ? <StatusBadge tone="success" dot>Delivered</StatusBadge> : <StatusBadge tone="neutral" dot>Cancelled</StatusBadge>,
          }))}
        </div>
      </>}
      {routesIn.length > 0 && <div className="capacity-note"><Warehouse size={16} />
        {routesIn.map(({ group, route }, index) => {
          const destination = workspace.locations.find((location) => location.id === group.locationId)
          const source = workspace.stock.find((record) => record.locationId === route.fromLocationId && record.productId === group.productId)
          return <span key={`${route.id}-${group.productId}`}>
            {index > 0 && <span className="capacity-separator" />}
            {destination?.receivingLimitPerDay !== null && destination?.receivingLimitPerDay !== undefined && <><strong>{destination.name} receiving limit</strong> {words.quantity(destination.receivingLimitPerDay, group.productId)}/day · </>}
            {source ? `${words.quantity(source.available.value, group.productId)}${manyProducts ? ` of ${words.productName(group.productId)}` : ''} unallocated at ${words.locationName(route.fromLocationId)}` : `${manyProducts ? `${words.productName(group.productId)} stock` : 'Stock'} at ${words.locationName(route.fromLocationId)} unknown`}
          </span>
        })}
      </div>}
    </section>
  )
}
