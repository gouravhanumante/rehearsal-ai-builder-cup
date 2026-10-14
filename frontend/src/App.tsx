import { useEffect, useMemo, useState } from 'react'
import { Info, X } from 'lucide-react'
import { Topbar } from './components/layout/Topbar'
import { SectionNavigation, type SectionName } from './components/layout/SectionNavigation'
import { AskAiPanel } from './components/assistant/AskAiPanel'
import { DetailsEditor } from './components/editing/DetailsEditor'
import { editorFor } from './components/editing/editorConfigs'
import { CommitmentsPanel } from './components/operations/CommitmentsPanel'
import { IncidentOverview } from './components/operations/IncidentOverview'
import { InventoryView } from './components/operations/InventoryView'
import { SuppliersView } from './components/operations/SuppliersView'
import { ApprovalWarning } from './components/planning/ApprovalWarning'
import { OverviewRecommendation } from './components/planning/OverviewRecommendation'
import { RecoveryPlans } from './components/planning/RecoveryPlans'
import type { Workspace } from '../../shared/planner/model'
import { rehearse, type Plan } from '../../shared/planner/plan'
import { sampleWorkspace } from '../../shared/planner/sample'
import { clearDemo, loadDemo, onDemoChangedElsewhere, saveDemo } from './data/demoStore'
import { checkPlanOnServer } from './data/planCheck'
import { createFormat } from './presentation/format'
import { createWording, type EditTarget } from './presentation/planText'
import { WorkspaceViewContext } from './presentation/workspaceView'
import './App.css'

type OpenEditor = { target: EditTarget; mode: 'manual' | 'document' }

function App() {
  const [initial] = useState(loadDemo)
  const [workspace, setWorkspace] = useState<Workspace>(initial.workspace)
  const [notice, setNotice] = useState<string | null>(initial.notice)
  const rehearsal = useMemo(() => rehearse(workspace), [workspace])
  const format = useMemo(() => createFormat(workspace.settings), [workspace.settings])
  const words = useMemo(() => createWording(workspace, format), [workspace, format])
  const view = useMemo(() => ({ workspace, rehearsal, format, words }), [workspace, rehearsal, format, words])
  const [pendingApproval, setPendingApproval] = useState<Plan | null>(null)
  const [editor, setEditor] = useState<OpenEditor | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionName>('Overview')
  const editorConfig = editor ? editorFor(editor.target, workspace, format) : null

  useEffect(() => onDemoChangedElsewhere((next) => {
    setWorkspace(next)
    setEditor(null)
    setPendingApproval(null)
  }), [])

  const persist = (next: Workspace) => {
    setWorkspace(next)
    saveDemo(next)
  }

  // Any change to the data means an earlier approval was given for different numbers.
  const saveChange = (next: Workspace) => {
    persist({ ...next, approval: null })
    setEditor(null)
  }

  const approve = (plan: Plan, withWarning: boolean) => {
    const defaultedConflicts = rehearsal.conflicts.filter((conflict) => !conflict.decided).length
    persist({ ...workspace, approval: { planId: plan.id, withWarning, approvedAt: new Date().toISOString(), defaultedConflicts } })
    setPendingApproval(null)
  }

  const requestApproval = async (plan: Plan) => {
    if (plan.status !== 'ready') return
    try {
      const check = await checkPlanOnServer(workspace, plan.id)
      if (!check.ready) {
        setNotice('The server\'s check found this plan is no longer ready, so it was not approved. Refresh the page and look at the options again.')
        return
      }
    } catch {
      setNotice('Couldn\'t double-check this plan with the server, so it was not approved. Check the connection and try again.')
      return
    }
    setNotice(null)
    const openConflicts = rehearsal.conflicts.some((conflict) => !conflict.decided)
    if (plan.unverified.length > 0 || openConflicts) setPendingApproval(plan)
    else approve(plan, false)
  }

  const decideConflict = (conflictId: string, winner: 'earliest-due' | 'priority') => {
    const others = workspace.conflictDecisions.filter((decision) => decision.conflictId !== conflictId)
    saveChange({ ...workspace, conflictDecisions: [...others, { conflictId, winner }] })
  }

  const resetDemo = () => {
    clearDemo()
    setWorkspace(sampleWorkspace)
    setNotice(null)
    setPendingApproval(null)
    setEditor(null)
    setAssistantOpen(false)
    setActiveSection('Overview')
  }

  const openEditor = (target: EditTarget, mode: 'manual' | 'document' = 'manual') => setEditor({ target, mode })

  const sectionCopy: Record<SectionName, { title: string; subtitle: string }> = {
    Overview: { title: 'Operations overview', subtitle: 'The delay, the orders at risk, and the next best response.' },
    Orders: { title: 'Orders', subtitle: 'Orders hit by the delayed shipment, and the ones that are not.' },
    Inventory: { title: 'Inventory by location', subtitle: 'Available stock, inbound shipments, transfers, and receiving limits.' },
    Suppliers: { title: 'Supplier commitments', subtitle: 'Confirmed shipment changes, backup suppliers, and details still missing.' },
    Rehearsals: { title: 'Recovery options', subtitle: 'Compare checked responses before changing the plan.' },
  }

  return (
    <WorkspaceViewContext.Provider value={view}>
      <div className="app-shell" id="top">
        <Topbar onAsk={() => setAssistantOpen(true)} onReset={resetDemo} />
        <div className="workspace-layout">
          <SectionNavigation activeSection={activeSection} affectedOrderCount={rehearsal.impact.affectedOrderIds.length} onNavigate={setActiveSection} />
          <main className="dashboard-shell">
            <section className="page-heading">
              <div>
                <p className="eyebrow">{workspace.businessName.toUpperCase()} · {activeSection.toUpperCase()}</p>
                <h1>{sectionCopy[activeSection].title}</h1>
                <p className="page-subtitle">{sectionCopy[activeSection].subtitle}</p>
              </div>
              <span className="workspace-state"><i /> Sample data · {format.currencySymbol} · {workspace.settings.timeZone}</span>
            </section>
            {notice && <div className="storage-notice" role="status"><Info size={15} /><span>{notice}</span><button aria-label="Dismiss" onClick={() => setNotice(null)} type="button"><X size={14} /></button></div>}
            {activeSection === 'Overview' && <>
              <IncidentOverview />
              <CommitmentsPanel showAll={false} onToggleAll={() => setActiveSection('Orders')} />
              <OverviewRecommendation onApprove={requestApproval} onViewOptions={() => setActiveSection('Rehearsals')} />
            </>}
            {activeSection === 'Orders' && <CommitmentsPanel onEditOrder={(orderId) => openEditor({ type: 'order', orderId })} showAll />}
            {activeSection === 'Inventory' && <InventoryView onEdit={openEditor} />}
            {activeSection === 'Suppliers' && <SuppliersView onEdit={openEditor} />}
            {activeSection === 'Rehearsals' && <RecoveryPlans onAddDetails={(target) => openEditor(target)} onApprove={requestApproval} onDecideConflict={decideConflict} />}
            <footer className="page-footer">
              <span>Illustrative distributor data · edits stay in this browser until Reset</span>
              <span>Approval is simulated · no business records change</span>
            </footer>
          </main>
        </div>
        {assistantOpen && <AskAiPanel onClose={() => setAssistantOpen(false)} onViewOptions={() => { setActiveSection('Rehearsals'); setAssistantOpen(false) }} />}
        {pendingApproval && <ApprovalWarning
          onAnswerConflicts={() => { setPendingApproval(null); setActiveSection('Rehearsals') }}
          onApproveAnyway={() => approve(pendingApproval, true)}
          onClose={() => setPendingApproval(null)}
          onVerify={(target) => { setPendingApproval(null); openEditor(target, 'document') }}
          plan={pendingApproval}
        />}
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

export default App
