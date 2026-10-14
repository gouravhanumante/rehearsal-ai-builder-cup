import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, FlaskConical, Upload } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { supportedCountries } from '../../../../shared/planner/countries'

type StartScreenProps = {
  existingName: string | null
  notice: string | null
  onContinue: () => void
  onTrySample: () => void
  onCreate: (businessName: string, country: string) => void
  onRestore: (file: File) => void
}

export function StartScreen({ existingName, notice, onContinue, onTrySample, onCreate, onRestore }: StartScreenProps) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('IN')
  const [creating, setCreating] = useState(false)
  const trimmed = name.trim()

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmed) onCreate(trimmed, country)
  }

  return (
    <div className="start-screen">
      <header className="start-brand"><span className="brand-mark">R</span><span>rehearsal<span className="brand-period">.</span></span></header>
      <main className="start-main">
        <h1>Know what breaks before it does.</h1>
        <p className="start-lead">Tell Rehearsal about your stock, orders and suppliers once. When a shipment is late, it shows which customers are affected and checks every way out before you act.</p>
        {notice && <p className="storage-notice start-notice" role="status">{notice}</p>}
        <div className="start-cards">
          {existingName && <article className="start-card start-card--primary">
            <Building2 size={20} />
            <h2>{existingName}</h2>
            <p>Pick up where you left off.</p>
            <Button icon={<ArrowRight size={15} />} onClick={onContinue} variant="primary">Continue</Button>
          </article>}
          <article className={`start-card ${existingName ? '' : 'start-card--primary'}`}>
            <Building2 size={20} />
            <h2>{existingName ? 'Start a different business' : 'Set up my business'}</h2>
            <p>{existingName ? 'This replaces the saved workspace, so download a backup first.' : 'Start empty and add your locations, products, stock and orders at your own pace.'}</p>
            {!creating
              ? <Button onClick={() => setCreating(true)} variant={existingName ? 'secondary' : 'primary'}>{existingName ? 'Start new' : 'Set up my business'}</Button>
              : <form className="start-form" onSubmit={submit}>
                <label htmlFor="business-name">Business name</label>
                <input autoFocus id="business-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya Traders" value={name} />
                <label htmlFor="business-country">Country</label>
                <select id="business-country" onChange={(event) => setCountry(event.target.value)} value={country}>
                  {supportedCountries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
                <small>This sets your currency, number format and timezone.</small>
                <Button disabled={!trimmed} type="submit" variant="primary">Create workspace</Button>
              </form>}
          </article>
          <article className="start-card">
            <FlaskConical size={20} />
            <h2>Try the sample</h2>
            <p>A coffee distributor with a delayed shipment. No sign-up, nothing to enter.</p>
            <Button onClick={onTrySample} variant="secondary">Open the sample</Button>
          </article>
        </div>
        <label className="start-restore"><Upload size={14} /> Restore from a backup file
          <input accept="application/json,.json" className="visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onRestore(file) }} type="file" />
        </label>
      </main>
    </div>
  )
}
