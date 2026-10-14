import { Boxes, ClipboardCheck, ClipboardList, LayoutDashboard, ListChecks, Route, Truck } from 'lucide-react'

export type SectionName = 'Setup' | 'Overview' | 'Orders' | 'Inventory' | 'Between locations' | 'Suppliers' | 'Rehearsals'

type SectionNavigationProps = {
  activeSection: SectionName
  affectedOrderCount: number
  showSetup: boolean
  setupRemaining: number
  mode: 'demo' | 'real'
  onNavigate: (section: SectionName) => void
}

const sections = [
  { name: 'Setup' as const, icon: ListChecks },
  { name: 'Overview' as const, icon: LayoutDashboard },
  { name: 'Orders' as const, icon: ClipboardList },
  { name: 'Inventory' as const, icon: Boxes },
  { name: 'Between locations' as const, icon: Route },
  { name: 'Suppliers' as const, icon: Truck },
  { name: 'Rehearsals' as const, icon: ClipboardCheck },
]

export function SectionNavigation({ activeSection, affectedOrderCount, showSetup, setupRemaining, mode, onNavigate }: SectionNavigationProps) {
  return (
    <nav aria-label="Workspace sections" className="section-navigation">
      <p className="navigation-label">WORKSPACE</p>
      {sections.filter(({ name }) => name !== 'Setup' || showSetup).map(({ icon: Icon, name }) => (
        <button
          aria-current={activeSection === name ? 'page' : undefined}
          className={`section-nav-item ${activeSection === name ? 'is-active' : ''}`}
          key={name}
          onClick={() => onNavigate(name)}
          type="button"
        >
          <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>{name}</span>
          {name === 'Setup' && setupRemaining > 0 && <span aria-label={`${setupRemaining} setup steps left`} className="navigation-count navigation-count--soft">{setupRemaining}</span>}
          {name === 'Orders' && affectedOrderCount > 0 && <span aria-label={`${affectedOrderCount} orders at risk`} className="navigation-count">{affectedOrderCount}</span>}
        </button>
      ))}
      <div className="navigation-footnote"><span /> {mode === 'demo' ? 'Sample workspace' : 'Your workspace'}</div>
    </nav>
  )
}
