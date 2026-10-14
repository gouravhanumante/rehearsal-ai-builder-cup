import { useState, type FocusEvent, type KeyboardEvent } from 'react'
import { Search, X } from 'lucide-react'

type MultiPickerProps = {
  id: string
  label: string
  options: { value: string; label: string }[]
  chosen: string[]
  onChange: (chosen: string[]) => void
  describedBy?: string
}

const SHOWN = 50

/** Chosen items as chips, plus a search box that opens a scrollable list to tick more. Built for hundreds of options. */
export function MultiPicker({ id, label, options, chosen, onChange, describedBy }: MultiPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const labelOf = (value: string) => options.find((option) => option.value === value)?.label ?? value
  const needle = query.trim().toLowerCase()
  const matches = options.filter((option) => option.label.toLowerCase().includes(needle))
  const toggle = (value: string) => onChange(chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value])

  const closeIfLeaving = (event: FocusEvent<HTMLDivElement>) => {
    if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
  }
  // Escape closes the list, not the whole editor behind it.
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape' && open) {
      event.stopPropagation()
      setOpen(false)
    }
  }

  return (
    <div className="picker" onBlur={closeIfLeaving} onKeyDown={onKeyDown}>
      {chosen.length > 0 && <ul className="picker-chips" aria-label={`Chosen: ${chosen.length}`}>
        {chosen.map((value) => (
          <li key={value}>{labelOf(value)}<button aria-label={`Remove ${labelOf(value)}`} onClick={() => toggle(value)} type="button"><X size={12} /></button></li>
        ))}
      </ul>}
      <div className="picker-box">
        <Search size={15} />
        <input aria-controls={`${id}-list`} aria-describedby={describedBy} aria-expanded={open} aria-label={`Search ${label.toLowerCase()}`} id={id} onChange={(event) => { setQuery(event.target.value); setOpen(true) }} onClick={() => setOpen(true)} onFocus={() => setOpen(true)} placeholder={`Search ${options.length} ${label.toLowerCase().split(' ')[0]}…`} role="combobox" value={query} />
      </div>
      {open && <div className="picker-panel" id={`${id}-list`}>
        <div className="picker-list" role="listbox" aria-multiselectable="true" aria-label={label}>
          {matches.slice(0, SHOWN).map((option) => {
            const checked = chosen.includes(option.value)
            return (
              <label className={`picker-option ${checked ? 'is-checked' : ''}`} key={option.value}>
                <input checked={checked} onChange={() => toggle(option.value)} type="checkbox" />
                {option.label}
              </label>
            )
          })}
          {matches.length === 0 && <p className="picker-empty">Nothing matches “{query}”.</p>}
          {matches.length > SHOWN && <p className="picker-empty">Showing {SHOWN} of {matches.length}. Type to narrow the list.</p>}
        </div>
        <div className="picker-footer"><span>{chosen.length} chosen</span><button onClick={() => { setOpen(false); setQuery('') }} type="button">Done</button></div>
      </div>}
    </div>
  )
}
