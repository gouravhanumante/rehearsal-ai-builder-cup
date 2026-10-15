import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Download, EllipsisVertical, LogOut, RotateCcw, Sparkles, Trash2, Upload } from 'lucide-react'
import { Button } from '../../design-system/Button'

type TopbarProps = {
  accountEmail: string | null
  businessName: string
  mode: 'demo' | 'real'
  saveStatus: string | null
  onAsk: () => void
  onReset: () => void
  onSignOut: () => void
  onSwitch: () => void
  onExport: () => void
  onRestore: (file: File) => void
  onDelete: () => void
}

export function Topbar({ accountEmail, businessName, mode, saveStatus, onAsk, onReset, onSignOut, onSwitch, onExport, onRestore, onDelete }: TopbarProps) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent) { if (event.key === 'Escape') setOpen(false); return }
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', close)
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('keydown', close) }
  }, [open])

  const choose = (action: () => void) => () => { setOpen(false); action() }
  const picked = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (file) onRestore(file)
  }

  return (
    <header className="app-header">
      <a className="brand" href="#top" aria-label="Rehearsal home">
        <span className="brand-mark">R</span>
        <span>rehearsal<span className="brand-period">.</span></span>
      </a>
      <div className="workspace-name"><strong>{businessName}</strong><span>{mode === 'demo' ? 'Distributor · Sample data' : saveStatus ?? 'Your workspace'}</span></div>
      <div className="header-actions">
        <Button className="ask-ai-button" icon={<Sparkles size={16} />} onClick={onAsk} variant="primary">Ask AI</Button>
        {mode === 'demo' && <Button className="reset-button" icon={<RotateCcw size={15} />} onClick={onReset} title="Reset demo" variant="secondary">Reset</Button>}
        <div className="workspace-menu" ref={menuRef}>
          <Button aria-expanded={open} aria-haspopup="menu" aria-label="Workspace menu" className="menu-button" icon={<EllipsisVertical size={16} />} onClick={() => setOpen((value) => !value)} variant="secondary" />
          {open && <div className="workspace-menu-list" role="menu">
            <button onClick={choose(onSwitch)} role="menuitem" type="button">{mode === 'demo' ? 'Set up my business' : 'Try the sample'}</button>
            {mode === 'real' && <>
              <button onClick={choose(onExport)} role="menuitem" type="button"><Download size={14} /> Download backup</button>
              <button onClick={() => { setOpen(false); fileRef.current?.click() }} role="menuitem" type="button"><Upload size={14} /> Restore from backup</button>
              <button className="is-danger" onClick={choose(onDelete)} role="menuitem" type="button"><Trash2 size={14} /> Delete this workspace</button>
            </>}
            {accountEmail && <button onClick={choose(onSignOut)} role="menuitem" title={accountEmail} type="button"><LogOut size={14} /> Sign out</button>}
            {mode === 'demo' && <button onClick={() => { setOpen(false); fileRef.current?.click() }} role="menuitem" type="button"><Upload size={14} /> Restore my business from backup</button>}
          </div>}
          <input accept="application/json,.json" className="visually-hidden" onChange={picked} ref={fileRef} tabIndex={-1} type="file" />
        </div>
      </div>
    </header>
  )
}
