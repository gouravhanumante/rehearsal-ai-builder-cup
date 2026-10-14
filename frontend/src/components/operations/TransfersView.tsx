import { useState } from 'react'
import { ArrowRight, Ban, PencilLine, Plus, RotateCcw, Route, Trash2 } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { EditTarget } from '../../presentation/planText'
import { searchPage } from '../../presentation/listPage'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { EmptyState } from '../layout/EmptyState'
import { Pager, SearchBox } from './InventoryView'

type TransfersViewProps = {
  onEdit: (target: EditTarget, mode: 'manual' | 'document') => void
  onRemoveRoute: (routeId: string) => void
  onAskAgain: (fromLocationId: string, toLocationId: string) => void
}

/** Which locations can move stock to which, and pairs the user said can't. */
export function TransfersView({ onEdit, onRemoveRoute, onAskAgain }: TransfersViewProps) {
  const { workspace, words } = useWorkspaceView()
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const nameOf = (from: string, to: string) => `${words.locationName(from)} ${words.locationName(to)}`
  const routes = searchPage(workspace.routes, (route) => nameOf(route.fromLocationId, route.toLocationId), query, page)
  const blocked = workspace.noTransfers ?? []
  const twoLocations = workspace.locations.length >= 2

  return (
    <div className="suppliers-page">
      <section className="data-view" aria-labelledby="routes-title">
        <div className="section-heading data-view-heading">
          <div>
            <p className="section-kicker">BETWEEN YOUR LOCATIONS</p>
            <h2 id="routes-title">Transfer routes</h2>
            <p className="data-view-description">Where you can move stock from one location to another, and how long it takes. Rehearsal only suggests transfers along these routes.</p>
          </div>
          <div className="data-view-actions">
            <Button disabled={!twoLocations} icon={<Plus size={15} />} onClick={() => onEdit({ type: 'new-route' }, 'manual')} variant="primary">Add transfer route</Button>
          </div>
        </div>
        {workspace.routes.length === 0
          ? <EmptyState body={twoLocations ? 'Add a route when one location can send stock to another. Rehearsal will then check it whenever one of them runs short.' : 'Add a second location first.'} icon={<Route size={20} />} title="No transfer routes yet" />
          : <>
            {workspace.routes.length > 8 && <SearchBox label="Search by location" onChange={(value) => { setQuery(value); setPage(0) }} value={query} />}
            <ul className="route-list">
              {routes.items.map((route) => {
                const from = words.locationName(route.fromLocationId)
                const to = words.locationName(route.toLocationId)
                return (
                  <li className="route-row" key={route.id}>
                    <div className="route-pair"><strong>{from}</strong><ArrowRight aria-hidden="true" size={16} /><strong>{to}</strong></div>
                    <div className="route-when">
                      {words.routeTime(route).known
                        ? <><span>{words.routeTime(route).text}</span><EvidenceMark evidence={words.routeTime(route).evidence} /></>
                        : <StatusBadge dot tone="warning">Travel time unknown</StatusBadge>}
                      {route.quotes.length > 0 && <small>{route.quotes.length} price {route.quotes.length === 1 ? 'quote' : 'quotes'}</small>}
                    </div>
                    <div className="route-actions">
                      <Button aria-label={`Edit transfer ${from} to ${to}`} icon={<PencilLine size={14} />} onClick={() => onEdit({ type: 'route', routeId: route.id }, 'manual')} variant="secondary">Edit</Button>
                      <Button aria-label={`Remove transfer ${from} to ${to}`} icon={<Trash2 size={14} />} onClick={() => onRemoveRoute(route.id)} variant="quiet">Remove</Button>
                    </div>
                  </li>
                )
              })}
            </ul>
            <Pager noun="route" onPage={setPage} page={routes.page} pageCount={routes.pageCount} total={routes.total} />
          </>}
      </section>

      {blocked.length > 0 && <section className="data-view" aria-labelledby="blocked-title">
        <div className="section-heading data-view-heading">
          <div>
            <p className="section-kicker">YOU SAID NO</p>
            <h2 id="blocked-title">Can&apos;t move stock this way</h2>
            <p className="data-view-description">Rehearsal won&apos;t ask about these. Change your answer any time.</p>
          </div>
        </div>
        <ul className="route-list">
          {blocked.map((pair) => {
            const from = words.locationName(pair.fromLocationId)
            const to = words.locationName(pair.toLocationId)
            return (
              <li className="route-row route-row--blocked" key={`${pair.fromLocationId}|${pair.toLocationId}`}>
                <div className="route-pair"><Ban aria-hidden="true" size={15} /><strong>{from}</strong><ArrowRight aria-hidden="true" size={16} /><strong>{to}</strong></div>
                <div className="route-actions">
                  <Button icon={<Plus size={14} />} onClick={() => onEdit({ type: 'new-route', fromLocationId: pair.fromLocationId, toLocationId: pair.toLocationId }, 'manual')} variant="secondary">It can, add route</Button>
                  <Button icon={<RotateCcw size={14} />} onClick={() => onAskAgain(pair.fromLocationId, pair.toLocationId)} variant="quiet">Ask me again</Button>
                </div>
              </li>
            )
          })}
        </ul>
      </section>}
    </div>
  )
}
