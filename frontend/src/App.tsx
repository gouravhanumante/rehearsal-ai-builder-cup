import { useEffect, useMemo, useState } from 'react'
import { Topbar } from './components/layout/Topbar'
import { SectionNavigation, type SectionName } from './components/layout/SectionNavigation'
import { AskAiPanel } from './components/assistant/AskAiPanel'
import { DetailsEditor } from './components/editing/DetailsEditor'
import { editorFor, type EditTarget } from './components/editing/editorConfigs'
import { CommitmentsPanel } from './components/operations/CommitmentsPanel'
import { IncidentOverview } from './components/operations/IncidentOverview'
import { InventoryView } from './components/operations/InventoryView'
import { SuppliersView } from './components/operations/SuppliersView'
import { ApprovalWarning } from './components/planning/ApprovalWarning'
import { OverviewRecommendation } from './components/planning/OverviewRecommendation'
import { RecoveryPlans, type Approval } from './components/planning/RecoveryPlans'
import type { RecoveryPlan } from './data/demoDistributor'
import { distributorDemo, type DistributorData } from './data/distributorDemo'
import { clearDemo, loadDemo, onDemoChangedElsewhere, saveDemo } from './data/demoStore'
import { rehearseDistributor } from './domain/rehearseDistributor'
import './App.css'

type OpenEditor = { target: EditTarget; mode: 'manual' | 'document' }

function App() {
  const [data, setData] = useState<DistributorData>(loadDemo)
  const rehearsal = useMemo(() => rehearseDistributor(data), [data])
  const [approval, setApproval] = useState<Approval | null>(null)
  const [pendingApproval, setPendingApproval] = useState<RecoveryPlan | null>(null)
  const [editor, setEditor] = useState<OpenEditor | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionName>('Overview')
  const editorConfig = editor ? editorFor(editor.target, data) : null

  useEffect(() => onDemoChangedElsewhere((next) => {
    setData(next)
    setApproval(null)
    setEditor(null)
  }), [])

  const approvePlan = (plan: RecoveryPlan) => {
    if (plan.status !== 'ready') return
    if (plan.unverifiedFacts.length > 0) setPendingApproval(plan)
    else setApproval({ planId: plan.id, withWarning: false })
  }

  const saveData = (next: DistributorData) => {
    setData(next)
    saveDemo(next)
    // An approval was given for the old numbers; it no longer stands.
    setApproval(null)
    setEditor(null)
  }

  const resetDemo = () => {
    clearDemo()
    setData(distributorDemo)
    setApproval(null)
    setPendingApproval(null)
    setEditor(null)
    setAssistantOpen(false)
    setActiveSection('Overview')
  }

  const sectionCopy: Record<SectionName, { title: string; subtitle: string }> = {
    Overview: { title: 'Operations overview', subtitle: 'The shipment delay, the orders at risk, and the next best response.' },
    Orders: { title: 'Orders', subtitle: 'Orders hit by the delayed shipment, and the ones that are not.' },
    Inventory: { title: 'Inventory by warehouse', subtitle: 'Available stock, inbound cases, and transfer limits.' },
    Suppliers: { title: 'Supplier commitments', subtitle: 'Confirmed shipment changes, backup suppliers, and details still missing.' },
    Rehearsals: { title: 'Recovery options', subtitle: 'Compare checked responses before changing the plan.' },
  }

  return (
    <div className="app-shell" id="top">
      <Topbar onAsk={() => setAssistantOpen(true)} onReset={resetDemo} />
      <div className="workspace-layout">
        <SectionNavigation activeSection={activeSection} affectedOrderCount={rehearsal.impact.affectedOrderCount} onNavigate={setActiveSection} />
        <main className="dashboard-shell">
          <section className="page-heading">
            <div>
              <p className="eyebrow">{data.businessName.toUpperCase()} · {activeSection.toUpperCase()}</p>
              <h1>{sectionCopy[activeSection].title}</h1>
              <p className="page-subtitle">{sectionCopy[activeSection].subtitle}</p>
            </div>
            <span className="workspace-state"><i /> Sample data · edits stay in this browser</span>
          </section>
          {activeSection === 'Overview' && <>
            <IncidentOverview data={data} rehearsal={rehearsal} />
            <CommitmentsPanel data={data} rehearsal={rehearsal} showAll={false} onToggleAll={() => setActiveSection('Orders')} />
            <OverviewRecommendation approval={approval} onApprove={approvePlan} onViewOptions={() => setActiveSection('Rehearsals')} rehearsal={rehearsal} />
          </>}
          {activeSection === 'Orders' && <CommitmentsPanel data={data} onEditOrder={(orderId) => setEditor({ target: { type: 'order', orderId }, mode: 'manual' })} rehearsal={rehearsal} showAll />}
          {activeSection === 'Inventory' && <InventoryView data={data} onEdit={(mode) => setEditor({ target: { type: 'inventory' }, mode })} />}
          {activeSection === 'Suppliers' && <SuppliersView data={data} onAdd={() => setEditor({ target: { type: 'new-supplier' }, mode: 'manual' })} onEdit={(supplierId, mode) => setEditor({ target: { type: 'supplier', supplierId }, mode })} rehearsal={rehearsal} />}
          {activeSection === 'Rehearsals' && <RecoveryPlans approval={approval} onAddDetails={(supplierId) => setEditor({ target: { type: 'supplier', supplierId }, mode: 'manual' })} onApprove={approvePlan} rehearsal={rehearsal} />}
          <footer className="page-footer">
            <span>Illustrative distributor data · Reset restores the sample</span>
            <span>Approval is simulated · no business records change</span>
          </footer>
        </main>
      </div>
      {assistantOpen && <AskAiPanel data={data} onClose={() => setAssistantOpen(false)} onViewOptions={() => { setActiveSection('Rehearsals'); setAssistantOpen(false) }} rehearsal={rehearsal} />}
      {pendingApproval && <ApprovalWarning
        onApproveAnyway={() => { setApproval({ planId: pendingApproval.id, withWarning: true }); setPendingApproval(null) }}
        onClose={() => setPendingApproval(null)}
        onVerify={(target) => { setPendingApproval(null); setEditor({ target, mode: 'document' }) }}
        plan={pendingApproval}
      />}
      {editor && editorConfig && <DetailsEditor
        config={editorConfig}
        current={data}
        initialMode={editor.mode}
        key={`${JSON.stringify(editor.target)}-${editor.mode}`}
        onApply={saveData}
        onClose={() => setEditor(null)}
      />}
    </div>
  )
}

export default App
