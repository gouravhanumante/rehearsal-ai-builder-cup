import { Boxes, ClipboardCheck, ClipboardList, LayoutDashboard, Truck } from 'lucide-react'

export type SectionName = 'Overview' | 'Orders' | 'Inventory' | 'Suppliers' | 'Rehearsals'

type SectionNavigationProps = {
  activeSection: SectionName
  onNavigate: (section: SectionName) => void
}

const sections = [
  { name: 'Overview' as const, icon: LayoutDashboard },
  { name: 'Orders' as const, icon: ClipboardList },
  { name: 'Inventory' as const, icon: Boxes },
  { name: 'Suppliers' as const, icon: Truck },
  { name: 'Rehearsals' as const, icon: ClipboardCheck },
]

export function SectionNavigation({ activeSection, onNavigate }: SectionNavigationProps) {
  return (
    <nav aria-label="Workspace sections" className="section-navigation">
      <p className="navigation-label">WORKSPACE</p>
      {sections.map(({ icon: Icon, name }) => (
        <button
          aria-current={activeSection === name ? 'page' : undefined}
          className={`section-nav-item ${activeSection === name ? 'is-active' : ''}`}
          key={name}
          onClick={() => onNavigate(name)}
          type="button"
        >
          <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>{name}</span>
          {name === 'Orders' && <span className="navigation-count">3</span>}
        </button>
      ))}
      <div className="navigation-footnote"><span /> Sample workspace</div>
    </nav>
  )
}
