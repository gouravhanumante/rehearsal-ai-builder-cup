import { RotateCcw, Sparkles } from 'lucide-react'
import { Button } from '../../design-system/Button'

type TopbarProps = {
  onAsk: () => void
  onReset: () => void
}

export function Topbar({ onAsk, onReset }: TopbarProps) {
  return (
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Rehearsal home">
        <span className="brand-mark">R</span>
        <span>rehearsal<span className="brand-period">.</span></span>
      </a>
      <div className="workspace-name"><strong>Northstar Supply</strong><span>Distributor · Sample data</span></div>
      <div className="header-actions">
        <Button className="ask-ai-button" icon={<Sparkles size={16} />} onClick={onAsk} variant="primary">Ask AI</Button>
        <Button className="reset-button" icon={<RotateCcw size={15} />} onClick={onReset} title="Reset demo" variant="secondary">Reset</Button>
      </div>
    </header>
  )
}
