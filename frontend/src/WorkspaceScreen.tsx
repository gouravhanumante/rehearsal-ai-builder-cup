import { useMemo, useState } from 'react'
import { Boxes, ClipboardPlus, FileUp, Info, MapPinPlus, PackagePlus, Route, TriangleAlert, Truck, X } from 'lucide-react'
import { Topbar } from './components/layout/Topbar'
import { SectionNavigation, type SectionName } from './components/layout/SectionNavigation'
import { AskAiPanel, type ChatTurn } from './components/assistant/AskAiPanel'
import { DetailsEditor } from './components/editing/DetailsEditor'
import { editorFor } from './components/editing/editorConfigs'
import { CommitmentsPanel } from './components/operations/CommitmentsPanel'
import { IncidentOverview } from './components/operations/IncidentOverview'
import { InventoryView } from './components/operations/InventoryView'
import { SuppliersView } from './components/operations/SuppliersView'
import { TransfersView } from './components/operations/TransfersView'
import { ConfirmDialog } from './components/layout/ConfirmDialog'
import { ApprovalWarning } from './components/planning/ApprovalWarning'
import { OverviewRecommendation } from './components/planning/OverviewRecommendation'
import { RecoveryPlans } from './components/planning/RecoveryPlans'
import { ImportDialog } from './components/import/ImportDialog'
import { SetupView, type SetupAction } from './components/setup/SetupView'
import type { ImportKind } from '../../shared/import/fields'
import type { Workspace } from '../../shared/planner/model'
import { planningNow, rehearse, type Plan } from '../../shared/planner/plan'
import { applyPlan, setOrderStatus } from '../../shared/planner/apply'
import { checkPlanOnServer } from './data/planCheck'
import { createFormat } from './presentation/format'
import { createWording, type EditTarget } from './presentation/planText'
import { setupProgress, type SetupStepId } from './presentation/setup'
import { WorkspaceViewContext } from './presentation/workspaceView'

type OpenEditor = { target: EditTarget; mode: 'manual' | 'document' }

type WorkspaceScreenProps = {
  workspace: Workspace
  notice: string | null
  saveStatus: string | null
  onChange: (next: Workspace) => void
  onNotice: (message: string | null) => void
  onResetDemo: () => void
  onSwitch: () => void
  onExport: () => void
  onRestore: (file: File) => void
  onDelete: () => void
}

export function WorkspaceScreen({ workspace, notice, saveStatus, onChange, onNotice, onResetDemo, onSwitch, onExport, onRestore, onDelete }: WorkspaceScreenProps) {
  const rehearsal = useMemo(() => rehearse(workspace), [workspace])
  const format = useMemo(() => createFormat(workspace.settings), [workspace.settings])
  const words = useMemo(() => createWording(workspace, format), [workspace, format])
  const view = useMemo(() => ({ workspace, rehearsal, format, words }), [workspace, rehearsal, format, words])
  const progress = useMemo(() => setupProgress(workspace), [workspace])
  const isReal = workspace.mode === 'real'
  const [pendingApproval, setPendingApproval] = useState<Plan | null>(null)
  const [editor, setEditor] = useState<OpenEditor | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
  const [importKind, setImportKind] = useState<ImportKind | null>(null)
  const [removingRouteId, setRemovingRouteId] = useState<string | null>(null)
  const [removingSupplierId, setRemovingSupplierId] = useState<string | null>(null)
  const [closing, setClosing] = useState<{ orderId: string; status: 'delivered' | 'cancelled' } | null>(null)
  const [activeSection, setActiveSection] = useState<SectionName>(isReal && progress.isEmpty ? 'Setup' : 'Overview')
  const editorConfig = editor ? editorFor(editor.target, workspace, format) : null

  // Any change to the data means an earlier approval was given for different numbers.
  const saveChange = (next: Workspace) => {
    onChange({ ...next, approval: null })
    setEditor(null)
  }

  const approve = (plan: Plan, withWarning: boolean) => {
    const next = applyPlan(workspace, plan, planningNow(workspace))
    if (next !== workspace) {
      saveChange(next)
      onNotice(approvedNotice(plan))
      setPendingApproval(null)
      return
    }
    const defaultedConflicts = rehearsal.conflicts.filter((conflict) => !conflict.decided).length
    onChange({ ...workspace, approval: { planId: plan.id, withWarning, approvedAt: new Date().toISOString(), defaultedConflicts } })
    setPendingApproval(null)
  }

  const approvedNotice = (plan: Plan) => {
    const what = words.quantity(plan.quantity ?? 0, plan.productId)
    const to = words.locationName(plan.locationId)
    const when = plan.arrivalAt ? format.dateTime(plan.arrivalAt) : ''
    if (plan.kind === 'ship-from') {
      const order = workspace.orders.find((item) => item.id === plan.orderId)
      return `${order?.customer ?? plan.orderId}'s order ${plan.orderId} now ships from ${words.locationName(plan.sourceLocationId ?? '')}.`
    }
    if (plan.kind === 'transfer') return `Recorded: ${what} leave ${words.locationName(plan.sourceLocationId ?? '')} now and arrive at ${to} ${when}. It is listed under Suppliers → Incoming deliveries.`
    return `Recorded: buying ${what} from ${words.supplierName(plan.supplierId)}, arriving at ${to} ${when}. It is listed under Suppliers → Incoming deliveries.`
  }

  const requestApproval = async (plan: Plan) => {
    if (plan.status !== 'ready') return
    try {
      const check = await checkPlanOnServer(workspace, plan.id)
      if (!check.ready) {
        onNotice('The server\'s check found this plan is no longer ready, so it was not approved. Refresh the page and look at the options again.')
        return
      }
    } catch {
      onNotice('Couldn\'t double-check this plan with the server, so it was not approved. Check the connection and try again.')
      return
    }
    onNotice(null)
    const openConflicts = rehearsal.conflicts.some((conflict) => !conflict.decided)
    if (plan.unverified.length > 0 || openConflicts) setPendingApproval(plan)
    else approve(plan, false)
  }

  const decideConflict = (conflictId: string, winner: 'earliest-due' | 'priority') => {
    const others = workspace.conflictDecisions.filter((decision) => decision.conflictId !== conflictId)
    saveChange({ ...workspace, conflictDecisions: [...others, { conflictId, winner }] })
  }

  const openEditor = (target: EditTarget, mode: 'manual' | 'document' = 'manual') => setEditor({ target, mode })
  const ruleOutTransfer = (fromLocationId: string, toLocationId: string) => {
    saveChange({ ...workspace, noTransfers: [...(workspace.noTransfers ?? []), { fromLocationId, toLocationId }] })
    onNotice('Saved. You can change this answer any time in Transfers.')
  }
  const askAgain = (fromLocationId: string, toLocationId: string) =>
    saveChange({ ...workspace, noTransfers: (workspace.noTransfers ?? []).filter((pair) => !(pair.fromLocationId === fromLocationId && pair.toLocationId === toLocationId)) })
  const removingRoute = workspace.routes.find((route) => route.id === removingRouteId)
  const removingSupplier = workspace.suppliers.find((supplier) => supplier.id === removingSupplierId)
  const closingOrder = workspace.orders.find((order) => order.id === closing?.orderId)
  const setStatus = (orderId: string, status: 'open' | 'delivered' | 'cancelled') => {
    if (status !== 'open') { setClosing({ orderId, status }); return }
    saveChange(setOrderStatus(workspace, orderId, 'open', planningNow(workspace)))
    onNotice(`${orderId} is open again and counts toward stock.`)
  }
  const orderGoods = (orderId: string) => {
    const order = workspace.orders.find((item) => item.id === orderId)
    return order ? `${order.lines.map((line) => `${words.quantity(line.quantity, line.productId)} of ${words.productName(line.productId)}`).join(', ')} from ${words.locationName(order.locationId)}` : ''
  }
  // A removed route is remembered as "can't move this way" so Rehearsal doesn't ask straight back.
  const removeRoute = () => {
    if (!removingRoute) return
    const { fromLocationId, toLocationId } = removingRoute
    const others = (workspace.noTransfers ?? []).filter((pair) => !(pair.fromLocationId === fromLocationId && pair.toLocationId === toLocationId))
    saveChange({ ...workspace, routes: workspace.routes.filter((route) => route.id !== removingRoute.id), noTransfers: [...others, { fromLocationId, toLocationId }] })
    setRemovingRouteId(null)
  }

  const needsBoth = workspace.products.length === 0 || workspace.locations.length === 0 ? 'Add a product and a location first' : undefined
  const setupActions: Partial<Record<SetupStepId, SetupAction[]>> = {
    locations: [{ label: 'Add location', icon: <MapPinPlus size={14} />, onClick: () => openEditor({ type: 'new-location' }), primary: progress.next?.id === 'locations' }],
    products: [{ label: 'Add product', icon: <PackagePlus size={14} />, onClick: () => openEditor({ type: 'new-product' }), primary: progress.next?.id === 'products' }],
    stock: [{ label: 'Import file', icon: <FileUp size={14} />, onClick: () => setImportKind('stock') }, { label: 'Open Inventory', icon: <Boxes size={14} />, onClick: () => setActiveSection('Inventory'), primary: progress.next?.id === 'stock' }],
    orders: [{ label: 'Import file', icon: <FileUp size={14} />, onClick: () => setImportKind('orders') }, { label: 'Add order', icon: <ClipboardPlus size={14} />, onClick: () => openEditor({ type: 'new-order' }), primary: progress.next?.id === 'orders', blockedBy: needsBoth }],
    shipments: [
      { label: 'Import file', icon: <FileUp size={14} />, onClick: () => setImportKind('shipments') },
      { label: 'Add shipment', icon: <Truck size={14} />, onClick: () => openEditor({ type: 'new-shipment' }), primary: progress.next?.id === 'shipments', blockedBy: needsBoth },
      { label: 'Report a delay', icon: <TriangleAlert size={14} />, onClick: () => openEditor({ type: 'report-delay' }), blockedBy: progress.canReportDelay ? undefined : 'Add a shipment first' },
    ],
    sources: [
      { label: 'Add supplier', icon: <Truck size={14} />, onClick: () => openEditor({ type: 'new-supplier' }), blockedBy: needsBoth },
      { label: 'Add transfer route', icon: <Route size={14} />, onClick: () => openEditor({ type: 'new-route' }), blockedBy: workspace.locations.length < 2 ? 'Add two locations first' : undefined },
    ],
  }
  const reportDelay = () => openEditor({ type: 'report-delay' })
  const resolveDelay = (disruptionId: string) => saveChange({ ...workspace, disruptions: workspace.disruptions.filter((item) => item.id !== disruptionId) })

  const sectionCopy: Record<SectionName, { title: string; subtitle: string }> = {
    Setup: { title: 'Set up your business', subtitle: 'Add your locations, products, stock, orders and shipments at your own pace.' },
    Overview: { title: 'Operations overview', subtitle: rehearsal.impact.groups.length === 0 && workspace.disruptions.length === 0 ? 'What Rehearsal is watching for you.' : 'What is wrong, the orders at risk, and the next best response.' },
    Orders: { title: 'Orders', subtitle: rehearsal.impact.groups.length === 0 ? 'Your open customer orders.' : 'Orders at risk, and the ones that are fine.' },
    Inventory: { title: 'Inventory', subtitle: 'Stock by product or by warehouse, incoming shipments, and transfers.' },
    Transfers: { title: 'Transfers', subtitle: 'Which of your locations can send stock to which, and how long it takes.' },
    Suppliers: { title: 'Suppliers', subtitle: 'Deliveries you are expecting, and backup suppliers for when things go wrong.' },
    Rehearsals: { title: 'Recovery options', subtitle: 'Compare checked responses before changing the plan.' },
  }
  const noDisruption = workspace.disruptions.length === 0 && rehearsal.impact.groups.length === 0
  const workspaceLabel = isReal ? 'Your data' : 'Sample data'

  return (
    <WorkspaceViewContext.Provider value={view}>
      <div className="app-shell" id="top">
        <Topbar businessName={workspace.businessName} mode={workspace.mode} onAsk={() => setAssistantOpen(true)} onDelete={onDelete} onExport={onExport} onReset={onResetDemo} onRestore={onRestore} onSwitch={onSwitch} saveStatus={saveStatus} />
        <div className="workspace-layout">
          <SectionNavigation activeSection={activeSection} affectedOrderCount={rehearsal.impact.affectedOrderIds.length} mode={workspace.mode} onNavigate={setActiveSection} setupRemaining={progress.requiredTotal - progress.requiredDone} showSetup={isReal} />
          <main className="dashboard-shell">
            <section className="page-heading">
              <div>
                <p className="eyebrow">{workspace.businessName.toUpperCase()} · {activeSection.toUpperCase()}</p>
                <h1>{sectionCopy[activeSection].title}</h1>
                <p className="page-subtitle">{sectionCopy[activeSection].subtitle}</p>
              </div>
              <span className="workspace-state"><i /> {workspaceLabel} · {format.currencySymbol} · {workspace.settings.timeZone}</span>
            </section>
            {notice && <div className="storage-notice" role="status"><Info size={15} /><span>{notice}</span><button aria-label="Dismiss" onClick={() => onNotice(null)} type="button"><X size={14} /></button></div>}
            {activeSection === 'Setup' && <SetupView actions={setupActions} />}
            {activeSection === 'Overview' && (noDisruption
              ? <>
                <IncidentOverview onAddShipment={() => setActiveSection('Setup')} onReportDelay={reportDelay} />
                {isReal && progress.next && <div className="setup-nudge"><div><strong>Next: {progress.next.title.toLowerCase()}</strong><span>{progress.next.description}</span></div><button onClick={() => setActiveSection('Setup')} type="button">Open setup</button></div>}
              </>
              : <>
                <IncidentOverview onReportDelay={isReal ? reportDelay : undefined} onResolve={isReal ? resolveDelay : undefined} />
                <CommitmentsPanel onToggleAll={() => setActiveSection('Orders')} showAll={false} />
                <OverviewRecommendation onApprove={requestApproval} onViewOptions={() => setActiveSection('Rehearsals')} />
              </>)}
            {activeSection === 'Orders' && <CommitmentsPanel onImportOrders={isReal ? () => setImportKind('orders') : undefined} onAddOrder={isReal && !needsBoth ? () => openEditor({ type: 'new-order' }) : undefined} onEditOrder={(orderId) => openEditor({ type: 'order', orderId })} onSetStatus={setStatus} showAll />}
            {activeSection === 'Inventory' && <InventoryView onEdit={openEditor} onImport={isReal ? () => setImportKind('stock') : undefined} />}
            {activeSection === 'Transfers' && <TransfersView onAskAgain={askAgain} onEdit={openEditor} onRemoveRoute={setRemovingRouteId} />}
            {activeSection === 'Suppliers' && <SuppliersView onEdit={openEditor} onRemoveSupplier={setRemovingSupplierId} />}
            {activeSection === 'Rehearsals' && <RecoveryPlans onAddDetails={openEditor} onApprove={requestApproval} onDecideConflict={decideConflict} onRuleOutTransfer={ruleOutTransfer} />}
            <footer className="page-footer">
              <span>{isReal ? 'Your data is saved in this browser. Download a backup from the menu.' : 'Illustrative distributor data · edits stay in this browser until Reset'}</span>
              <span>Approving records the change: stock moves, and transfers and purchases become incoming deliveries</span>
            </footer>
          </main>
        </div>
        {assistantOpen && <AskAiPanel onClose={() => setAssistantOpen(false)} onTurnsChange={setChatTurns} onViewOptions={() => { setActiveSection('Rehearsals'); setAssistantOpen(false) }} turns={chatTurns} />}
        {pendingApproval && <ApprovalWarning
          onAnswerConflicts={() => { setPendingApproval(null); setActiveSection('Rehearsals') }}
          onApproveAnyway={() => approve(pendingApproval, true)}
          onClose={() => setPendingApproval(null)}
          onVerify={(target) => { setPendingApproval(null); openEditor(target, 'document') }}
          plan={pendingApproval}
        />}
        {removingRoute && <ConfirmDialog
          body={`Rehearsal will stop suggesting transfers from ${words.locationName(removingRoute.fromLocationId)} to ${words.locationName(removingRoute.toLocationId)}. You can add it back any time in Transfers.`}
          confirmLabel="Remove route"
          onClose={() => setRemovingRouteId(null)}
          onConfirm={removeRoute}
          title={`Remove ${words.locationName(removingRoute.fromLocationId)} → ${words.locationName(removingRoute.toLocationId)}?`}
        />}
        {removingSupplier && <ConfirmDialog
          body={`Their products and any replies you recorded will be removed. Rehearsal will stop suggesting buying from ${removingSupplier.name}.`}
          confirmLabel="Remove supplier"
          onClose={() => setRemovingSupplierId(null)}
          onConfirm={() => { saveChange({ ...workspace, suppliers: workspace.suppliers.filter((item) => item.id !== removingSupplier.id) }); setRemovingSupplierId(null) }}
          title={`Remove ${removingSupplier.name}?`}
        />}
        {closing && closingOrder && <ConfirmDialog
          body={closing.status === 'delivered'
            ? `${orderGoods(closingOrder.id)} left with this order, so it comes off that warehouse's stock. The order stops counting toward shortages. You can reopen it if this was a mistake.`
            : `The order stops counting toward shortages, and its stock is free for other orders. You can reopen it later.`}
          confirmLabel={closing.status === 'delivered' ? 'Mark delivered' : 'Cancel order'}
          onClose={() => setClosing(null)}
          onConfirm={() => {
            saveChange(setOrderStatus(workspace, closingOrder.id, closing.status, planningNow(workspace)))
            onNotice(`${closingOrder.customer}'s order ${closingOrder.id} is ${closing.status}. It is listed under Orders → Delivered and cancelled.`)
            setClosing(null)
          }}
          title={closing.status === 'delivered' ? `Mark ${closingOrder.customer}'s order delivered?` : `Cancel ${closingOrder.customer}'s order?`}
        />}
        {importKind && <ImportDialog kind={importKind} onApply={(next) => { saveChange(next); setImportKind(null) }} onClose={() => setImportKind(null)} />}
        {editor && editorConfig && <DetailsEditor
          config={editorConfig}
          initialMode={editor.mode}
          key={`${JSON.stringify(editor.target)}-${editor.mode}`}
          onApply={saveChange}
          onClose={() => setEditor(null)}
        />}
      </div>
    </WorkspaceViewContext.Provider>
  )
}
