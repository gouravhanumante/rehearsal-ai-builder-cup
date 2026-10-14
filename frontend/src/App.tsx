import { useState } from 'react'
import { Topbar } from './components/layout/Topbar'
import { SectionNavigation, type SectionName } from './components/layout/SectionNavigation'
import { AskAiPanel } from './components/assistant/AskAiPanel'
import { CommitmentsPanel } from './components/operations/CommitmentsPanel'
import { IncidentOverview } from './components/operations/IncidentOverview'
import { InventoryView } from './components/operations/InventoryView'
import { SuppliersView } from './components/operations/SuppliersView'
import { OverviewRecommendation } from './components/planning/OverviewRecommendation'
import { RecoveryPlans } from './components/planning/RecoveryPlans'
import type { RecoveryPlan } from './data/demoDistributor'
import './App.css'

function App() {
  const [approvedPlan, setApprovedPlan] = useState<string | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [activeSection, setActiveSection] = useState<SectionName>('Overview')

  const approvePlan = (plan: RecoveryPlan) => {
    if (plan.status === 'ready') setApprovedPlan(plan.id)
  }

  const resetDemo = () => {
    setApprovedPlan(null)
    setAssistantOpen(false)
    setActiveSection('Overview')
  }

  const sectionCopy: Record<SectionName, { title: string; subtitle: string }> = {
    Overview: { title: 'Operations overview', subtitle: 'The shipment delay, the orders at risk, and the next best response.' },
    Orders: { title: 'Orders', subtitle: 'All customer commitments affected by the delayed shipment.' },
    Inventory: { title: 'Inventory by warehouse', subtitle: 'Available stock, inbound cases, and transfer limits.' },
    Suppliers: { title: 'Supplier commitments', subtitle: 'Confirmed shipment changes and supplier facts still missing.' },
    Rehearsals: { title: 'Recovery options', subtitle: 'Compare checked responses before changing the plan.' },
  }

  return (
    <div className="app-shell" id="top">
      <Topbar onAsk={() => setAssistantOpen(true)} onReset={resetDemo} />
      <div className="workspace-layout">
        <SectionNavigation activeSection={activeSection} onNavigate={setActiveSection} />
        <main className="dashboard-shell">
          <section className="page-heading">
            <div>
              <p className="eyebrow">NORTHSTAR SUPPLY · {activeSection.toUpperCase()}</p>
              <h1>{sectionCopy[activeSection].title}</h1>
              <p className="page-subtitle">{sectionCopy[activeSection].subtitle}</p>
            </div>
            <span className="workspace-state"><i /> Sample data</span>
          </section>
          {activeSection === 'Overview' && <>
            <IncidentOverview />
            <CommitmentsPanel showAll={false} onToggleAll={() => setActiveSection('Orders')} />
            <OverviewRecommendation approvedPlan={approvedPlan} onApprove={approvePlan} onViewOptions={() => setActiveSection('Rehearsals')} />
          </>}
          {activeSection === 'Orders' && <CommitmentsPanel showAll />}
          {activeSection === 'Inventory' && <InventoryView />}
          {activeSection === 'Suppliers' && <SuppliersView />}
          {activeSection === 'Rehearsals' && <RecoveryPlans approvedPlan={approvedPlan} onApprove={approvePlan} />}
          <footer className="page-footer">
            <span>Illustrative distributor data</span>
            <span>Approval is simulated · no business records change</span>
          </footer>
        </main>
      </div>
      {assistantOpen && <AskAiPanel onClose={() => setAssistantOpen(false)} onViewOptions={() => { setActiveSection('Rehearsals'); setAssistantOpen(false) }} />}
    </div>
  )
}

export default App
