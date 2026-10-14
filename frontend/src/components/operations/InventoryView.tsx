import { useState } from 'react'
import { ArrowDownToLine, Boxes, FileUp, MapPinPlus, PackagePlus, PencilLine, Settings2, Truck, Warehouse } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { EditTarget } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { EmptyState } from '../layout/EmptyState'

type InventoryViewProps = {
  onEdit: (target: EditTarget, mode: 'manual' | 'document') => void
  onImport?: () => void
}

const kindLabels = { warehouse: 'Warehouse', store: 'Store', 'distribution-centre': 'Distribution centre' }

export function InventoryView({ onEdit, onImport }: InventoryViewProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const [selectedProductId, setSelectedProductId] = useState(workspace.products[0]?.id ?? '')
  const product = workspace.products.find((item) => item.id === selectedProductId) ?? workspace.products[0]
  if (!product) {
    return (
      <section className="data-view" aria-labelledby="inventory-title">
        <div className="section-heading data-view-heading">
          <div><p className="section-kicker">INVENTORY</p><h2 id="inventory-title">Stock by location</h2></div>
        </div>
        <EmptyState body="Add the products you stock. Then add your locations and how much of each product is at each one." icon={<PackagePlus size={20} />} title="No products yet">
          {onImport && <Button icon={<FileUp size={14} />} onClick={onImport} variant="primary">Import stock file</Button>}
          <Button icon={<PackagePlus size={14} />} onClick={() => onEdit({ type: 'new-product' }, 'manual')} variant={onImport ? 'secondary' : 'primary'}>Add product</Button>
          <Button icon={<MapPinPlus size={14} />} onClick={() => onEdit({ type: 'new-location' }, 'manual')} variant="secondary">Add location</Button>
        </EmptyState>
      </section>
    )
  }
  const pressured = new Set(rehearsal.impact.groups.filter((group) => group.productId === product.id && (group.exposedQuantity ?? 1) > 0).map((group) => group.locationId))

  return (
    <section className="data-view" aria-labelledby="inventory-title">
      <div className="section-heading data-view-heading">
        <div>
          <p className="section-kicker">INVENTORY · {product.name}</p>
          <h2 id="inventory-title">Stock by location</h2>
          <p className="data-view-description">Available stock for {product.pack}.</p>
        </div>
        <div className="data-view-actions">
          {workspace.products.length > 1 && <label className="product-picker"><span className="visually-hidden">Product</span>
            <select onChange={(event) => setSelectedProductId(event.target.value)} value={product.id}>
              {workspace.products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>}
          {onImport && <Button icon={<FileUp size={14} />} onClick={onImport} variant="secondary">Import stock file</Button>}
          <Button icon={<Settings2 size={14} />} onClick={() => onEdit({ type: 'product', productId: product.id }, 'manual')} variant="quiet">Edit product</Button>
          <Button icon={<PackagePlus size={14} />} onClick={() => onEdit({ type: 'new-product' }, 'manual')} variant="secondary">Add product</Button>
          <Button icon={<MapPinPlus size={14} />} onClick={() => onEdit({ type: 'new-location' }, 'manual')} variant="secondary">Add location</Button>
        </div>
      </div>
      {workspace.locations.length === 0 && <EmptyState body="Add a warehouse, store or distribution centre to record stock there." icon={<MapPinPlus size={20} />} title="No locations yet">
        <Button icon={<MapPinPlus size={14} />} onClick={() => onEdit({ type: 'new-location' }, 'manual')} variant="primary">Add location</Button>
      </EmptyState>}
      <div className="inventory-grid">
        {workspace.locations.map((location) => {
          const record = workspace.stock.find((item) => item.locationId === location.id && item.productId === product.id)
          const inbound = workspace.shipments.filter((shipment) => shipment.locationId === location.id && shipment.lines.some((line) => line.productId === product.id))
          const routesIn = workspace.routes.filter((route) => route.toLocationId === location.id)
          const target = { type: 'stock' as const, locationId: location.id, productId: product.id }
          return (
            <article className="inventory-location" key={location.id}>
              <div className="location-heading">
                <span className="location-icon"><Warehouse size={17} /></span>
                <div><h3>{location.name}</h3><p>{kindLabels[location.kind]}</p></div>
                {pressured.has(location.id)
                  ? <StatusBadge tone="warning" dot>Under pressure</StatusBadge>
                  : record ? <StatusBadge tone={record.available.value > 0 ? 'success' : 'neutral'} dot>{record.available.value > 0 ? 'Available' : 'Empty'}</StatusBadge>
                    : <StatusBadge tone="neutral" dot>Not counted</StatusBadge>}
              </div>
              <div className="inventory-quantity">
                {record
                  ? <><strong>{format.number(record.available.value)}</strong><span>{record.available.value === 1 ? product.unit : `${product.unit}s`} available</span><EvidenceMark evidence={record.available.evidence} /></>
                  : <span>No stock count yet — unknown, not zero.</span>}
              </div>
              <div className="inventory-card-actions">
                <Button aria-label={`${record ? 'Edit count' : 'Add count'} at ${location.name}`} icon={<PencilLine size={14} />} onClick={() => onEdit(target, 'manual')} variant="quiet">{record ? 'Edit count' : 'Add count'}</Button>
                <Button aria-label={`Attach count sheet for ${location.name}`} icon={<FileUp size={14} />} onClick={() => onEdit(target, 'document')} variant="quiet">Attach count sheet</Button>
              </div>
              {inbound.map((shipment) => (
                <div className="inventory-inbound" key={shipment.id}><ArrowDownToLine size={15} /><span>
                  <strong>{words.quantity(shipment.lines.filter((line) => line.productId === product.id).reduce((total, line) => total + line.quantity, 0), product.id)} inbound</strong>
                  <small>From {shipment.supplierName} · {format.dateTime(shipment.confirmedArrivalAt)}</small>
                </span></div>
              ))}
              {routesIn.map((route) => (
                <div className="inventory-inbound inventory-inbound-neutral" key={route.id}><Truck size={15} /><span>
                  <strong>Transfer from {words.locationName(route.fromLocationId)}</strong>
                  <small>{route.arrivalAt.value ? `Arrives ${format.dateTime(route.arrivalAt.value)}` : 'Arrival time unknown'}</small>
                </span><Button aria-label={`Edit transfer from ${words.locationName(route.fromLocationId)}`} onClick={() => onEdit({ type: 'route', routeId: route.id }, 'manual')} variant="quiet">Edit</Button></div>
              ))}
              {inbound.length === 0 && routesIn.length === 0 && <div className="inventory-inbound inventory-inbound-neutral"><Boxes size={15} /><span><strong>Nothing inbound</strong><small>No shipments or transfers to this location.</small></span></div>}
              <div className="inventory-capacity">
                <span>Receiving limit</span>
                <strong>{location.receivingLimitPerDay === null ? 'No limit set' : `${words.quantity(location.receivingLimitPerDay, product.id)} / day`}</strong>
                <Button aria-label={`Edit ${location.name}`} onClick={() => onEdit({ type: 'location', locationId: location.id }, 'manual')} variant="quiet">Edit location</Button>
              </div>
            </article>
          )
        })}
      </div>
      <p className="sample-data-note">Stock you type in is marked unverified. Attach a count sheet or goods receipt to verify it.</p>
    </section>
  )
}
