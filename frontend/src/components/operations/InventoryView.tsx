import { useMemo, useState, type ReactNode } from 'react'
import { ArrowDownToLine, ChevronLeft, ChevronRight, FileUp, MapPinPlus, PackagePlus, PencilLine, Search, Settings2, Truck } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { Location, Product } from '../../../../shared/planner/model'
import type { EditTarget } from '../../presentation/planText'
import { searchPage } from '../../presentation/listPage'
import { pluralUnit } from '../../presentation/format'
import { storageCap } from '../../../../shared/planner/plan'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { EmptyState } from '../layout/EmptyState'

type InventoryViewProps = {
  onEdit: (target: EditTarget, mode: 'manual' | 'document') => void
  onImport?: () => void
}

type Mode = 'product' | 'location'

const kindLabels = { warehouse: 'Warehouse', store: 'Store', 'distribution-centre': 'Distribution centre' }
const pairKey = (locationId: string, productId: string) => `${locationId}|${productId}`

export function Pager({ page, pageCount, total, noun, onPage }: { page: number; pageCount: number; total: number; noun: string; onPage: (page: number) => void }) {
  const count = `${total} ${total === 1 ? noun : `${noun}s`}`
  if (pageCount <= 1) return <p className="inventory-pager"><span>{count}</span></p>
  return (
    <p className="inventory-pager">
      <span>Page {page + 1} of {pageCount} · {count}</span>
      <span>
        <Button aria-label="Previous page" disabled={page === 0} icon={<ChevronLeft size={14} />} onClick={() => onPage(page - 1)} variant="quiet" />
        <Button aria-label="Next page" disabled={page >= pageCount - 1} icon={<ChevronRight size={14} />} onClick={() => onPage(page + 1)} variant="quiet" />
      </span>
    </p>
  )
}

export function SearchBox({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="inventory-search">
      <Search aria-hidden="true" size={14} />
      <span className="visually-hidden">{label}</span>
      <input onChange={(event) => onChange(event.target.value)} placeholder={label} type="search" value={value} />
    </label>
  )
}

export function InventoryView({ onEdit, onImport }: InventoryViewProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const [mode, setMode] = useState<Mode>('product')
  const [selected, setSelected] = useState<Record<Mode, string>>({ product: workspace.products[0]?.id ?? '', location: workspace.locations[0]?.id ?? '' })
  const [listQuery, setListQuery] = useState<Record<Mode, string>>({ product: '', location: '' })
  const [listPage, setListPage] = useState<Record<Mode, number>>({ product: 0, location: 0 })
  const [detailQuery, setDetailQuery] = useState('')
  const [detailPage, setDetailPage] = useState(0)

  const stockByPair = useMemo(() => new Map(workspace.stock.map((record) => [pairKey(record.locationId, record.productId), record])), [workspace.stock])
  const countedByProduct = useMemo(() => countBy(workspace.stock.map((record) => record.productId)), [workspace.stock])
  const countedByLocation = useMemo(() => countBy(workspace.stock.map((record) => record.locationId)), [workspace.stock])
  const pressured = useMemo(() => new Set(rehearsal.impact.groups
    .filter((group) => (group.exposedQuantity ?? 1) > 0)
    .map((group) => pairKey(group.locationId, group.productId))), [rehearsal.impact.groups])

  const headerActions = <div className="data-view-actions">
    {onImport && <Button icon={<FileUp size={14} />} onClick={onImport} variant="secondary">Import stock file</Button>}
    <Button icon={<PackagePlus size={14} />} onClick={() => onEdit({ type: 'new-product' }, 'manual')} variant="secondary">Add product</Button>
    <Button icon={<MapPinPlus size={14} />} onClick={() => onEdit({ type: 'new-location' }, 'manual')} variant="secondary">Add location</Button>
  </div>

  if (workspace.products.length === 0 || workspace.locations.length === 0) {
    const noProducts = workspace.products.length === 0
    return (
      <section className="data-view" aria-labelledby="inventory-title">
        <div className="section-heading data-view-heading">
          <div><p className="section-kicker">INVENTORY</p><h2 id="inventory-title">Stock</h2></div>
        </div>
        {noProducts
          ? <EmptyState body="Add the products you stock. Then add your locations and how much of each product is at each one." icon={<PackagePlus size={20} />} title="No products yet">
            {onImport && <Button icon={<FileUp size={14} />} onClick={onImport} variant="primary">Import stock file</Button>}
            <Button icon={<PackagePlus size={14} />} onClick={() => onEdit({ type: 'new-product' }, 'manual')} variant={onImport ? 'secondary' : 'primary'}>Add product</Button>
            <Button icon={<MapPinPlus size={14} />} onClick={() => onEdit({ type: 'new-location' }, 'manual')} variant="secondary">Add location</Button>
          </EmptyState>
          : <EmptyState body="Add a warehouse, store or distribution centre to record stock there." icon={<MapPinPlus size={20} />} title="No locations yet">
            <Button icon={<MapPinPlus size={14} />} onClick={() => onEdit({ type: 'new-location' }, 'manual')} variant="primary">Add location</Button>
          </EmptyState>}
      </section>
    )
  }

  const product = workspace.products.find((item) => item.id === selected.product) ?? workspace.products[0]
  const location = workspace.locations.find((item) => item.id === selected.location) ?? workspace.locations[0]

  const switchMode = (next: Mode) => { setMode(next); setDetailQuery(''); setDetailPage(0) }
  const select = (id: string) => { setSelected((previous) => ({ ...previous, [mode]: id })); setDetailQuery(''); setDetailPage(0) }
  const searchList = (value: string) => { setListQuery((previous) => ({ ...previous, [mode]: value })); setListPage((previous) => ({ ...previous, [mode]: 0 })) }
  const searchDetail = (value: string) => { setDetailQuery(value); setDetailPage(0) }

  const productList = searchPage(workspace.products, (item) => item.name, listQuery.product, listPage.product)
  const locationList = searchPage(workspace.locations, (item) => item.name, listQuery.location, listPage.location)
  const list = mode === 'product' ? productList : locationList
  const detail = mode === 'product'
    ? searchPage(workspace.locations, (item) => item.name, detailQuery, detailPage)
    : searchPage(workspace.products, (item) => item.name, detailQuery, detailPage)

  const stockRow = (rowLocation: Location, rowProduct: Product, title: string, fallbackNote: string): ReactNode => {
    const record = stockByPair.get(pairKey(rowLocation.id, rowProduct.id))
    const inbound = workspace.shipments.filter((shipment) => shipment.locationId === rowLocation.id && shipment.lines.some((line) => line.productId === rowProduct.id))
    const inboundQuantity = inbound.reduce((total, shipment) => total + shipment.lines.filter((line) => line.productId === rowProduct.id).reduce((sum, line) => sum + line.quantity, 0), 0)
    const target = { type: 'stock' as const, locationId: rowLocation.id, productId: rowProduct.id }
    const cap = storageCap(workspace, rowLocation.id, rowProduct.id)
    const overCap = cap !== null && record !== undefined && record.available.value > cap
    return (
      <li className="stock-row" key={pairKey(rowLocation.id, rowProduct.id)}>
        <div className="stock-row-name">
          <strong>{title}</strong>
          {inbound.length > 0
            ? <small className="stock-row-inbound"><ArrowDownToLine size={11} /> {words.quantity(inboundQuantity, rowProduct.id)} arriving · {inbound.map((shipment) => `${shipment.supplierName}, ${format.dateTime(shipment.confirmedArrivalAt)}`).join('; ')}</small>
            : <small>{fallbackNote}</small>}
        </div>
        <div className="stock-row-quantity">
          {record
            ? <><strong>{format.number(record.available.value)}</strong><span>{pluralUnit(rowProduct.unit, record.available.value)}{cap !== null && ` of ${format.number(cap)} max`}</span></>
            : <span className="stock-row-unknown">Not counted · unknown, not zero</span>}
        </div>
        <div className="stock-row-status">
          {overCap && <StatusBadge tone="danger" dot>Over storage limit</StatusBadge>}
          {pressured.has(pairKey(rowLocation.id, rowProduct.id))
            ? <StatusBadge tone="warning" dot>Under pressure</StatusBadge>
            : record && record.available.value === 0 && <StatusBadge tone="neutral" dot>Empty</StatusBadge>}
          {record && <EvidenceMark evidence={record.available.evidence} />}
        </div>
        <div className="stock-row-actions">
          <Button aria-label={`${record ? 'Edit count' : 'Add count'}: ${rowProduct.name} at ${rowLocation.name}`} icon={<PencilLine size={13} />} onClick={() => onEdit(target, 'manual')} variant="quiet">{record ? 'Edit count' : 'Add count'}</Button>
          <Button aria-label={`Attach count sheet: ${rowProduct.name} at ${rowLocation.name}`} icon={<FileUp size={13} />} onClick={() => onEdit(target, 'document')} variant="quiet">Attach</Button>
        </div>
      </li>
    )
  }

  const routesIn = workspace.routes.filter((route) => route.toLocationId === location.id)

  return (
    <section className="data-view" aria-labelledby="inventory-title">
      <div className="section-heading data-view-heading">
        <div>
          <p className="section-kicker">INVENTORY</p>
          <h2 id="inventory-title">Stock</h2>
          <p className="data-view-description">Look up stock by product or by warehouse.</p>
        </div>
        {headerActions}
      </div>

      <div aria-label="Browse inventory" className="inventory-switch" role="group">
        <button aria-pressed={mode === 'product'} onClick={() => switchMode('product')} type="button">By product</button>
        <button aria-pressed={mode === 'location'} onClick={() => switchMode('location')} type="button">By warehouse</button>
      </div>

      <div className="inventory-browser">
        <div className="inventory-list">
          <SearchBox label={mode === 'product' ? 'Search products' : 'Search warehouses'} onChange={searchList} value={listQuery[mode]} />
          {list.total === 0
            ? <p className="inventory-no-match">No {mode === 'product' ? 'products' : 'warehouses'} match “{listQuery[mode]}”.</p>
            : <ul>
              {mode === 'product'
                ? productList.items.map((item) => (
                  <li key={item.id}><button aria-current={item.id === product.id} onClick={() => select(item.id)} type="button">
                    <strong>{item.name}</strong><small>Counted at {countedByProduct.get(item.id) ?? 0} of {workspace.locations.length} locations</small>
                  </button></li>
                ))
                : locationList.items.map((item) => (
                  <li key={item.id}><button aria-current={item.id === location.id} onClick={() => select(item.id)} type="button">
                    <strong>{item.name}</strong><small>{kindLabels[item.kind]} · {countedByLocation.get(item.id) ?? 0} of {workspace.products.length} products counted</small>
                  </button></li>
                ))}
            </ul>}
          <Pager noun={mode === 'product' ? 'product' : 'warehouse'} onPage={(page) => setListPage((previous) => ({ ...previous, [mode]: page }))} page={list.page} pageCount={list.pageCount} total={list.total} />
        </div>

        <div className="inventory-detail">
          {mode === 'product'
            ? <div className="inventory-detail-heading">
              <div><h3>{product.name}</h3><p>{product.perPackage ? `${product.perPackage} ${product.perPackage === 1 ? 'item' : 'items'} per package` : `${product.pack} · counted in ${pluralUnit(product.unit, 2)}`}</p></div>
              <Button icon={<Settings2 size={14} />} onClick={() => onEdit({ type: 'product', productId: product.id }, 'manual')} variant="secondary">Edit product</Button>
            </div>
            : <div className="inventory-detail-heading">
              <div>
                <h3>{location.name}</h3>
                <p>{kindLabels[location.kind]} · {location.receivingLimitPerDay === null ? 'No unloading limit set' : `Can unload ${format.number(location.receivingLimitPerDay)} a day`}</p>
              </div>
              <Button icon={<Settings2 size={14} />} onClick={() => onEdit({ type: 'location', locationId: location.id }, 'manual')} variant="secondary">Edit location</Button>
            </div>}

          {mode === 'location' && routesIn.length > 0 && <ul className="inventory-routes">
            {routesIn.map((route) => (
              <li key={route.id}>
                <Truck size={14} />
                <span><strong>Transfer from {words.locationName(route.fromLocationId)}</strong><small>{route.arrivalAt.value ? `Arrives ${format.dateTime(route.arrivalAt.value)}` : 'Arrival time unknown'}</small></span>
                <Button aria-label={`Edit transfer from ${words.locationName(route.fromLocationId)}`} onClick={() => onEdit({ type: 'route', routeId: route.id }, 'manual')} variant="quiet">Edit</Button>
              </li>
            ))}
          </ul>}

          <SearchBox label={mode === 'product' ? `Search warehouses for ${product.name}` : `Search products at ${location.name}`} onChange={searchDetail} value={detailQuery} />
          {detail.total === 0
            ? <p className="inventory-no-match">Nothing matches “{detailQuery}”.</p>
            : <ul className="stock-rows">
              {mode === 'product'
                ? (detail.items as Location[]).map((item) => stockRow(item, product, item.name, kindLabels[item.kind]))
                : (detail.items as Product[]).map((item) => stockRow(location, item, item.name, item.pack))}
            </ul>}
          <Pager noun={mode === 'product' ? 'warehouse' : 'product'} onPage={setDetailPage} page={detail.page} pageCount={detail.pageCount} total={detail.total} />
        </div>
      </div>
      <p className="sample-data-note">Stock you type in is marked unverified. Attach a count sheet or goods receipt to verify it.</p>
    </section>
  )
}

function countBy(ids: string[]) {
  const counts = new Map<string, number>()
  for (const id of ids) counts.set(id, (counts.get(id) ?? 0) + 1)
  return counts
}
