import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CloudUpload, FlaskConical, LogIn, Upload } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { supportedCountries } from '../../../../shared/planner/countries'

type StartScreenProps = {
  /** Null when signed out. */
  accountEmail: string | null
  busy: boolean
  cloudName: string | null
  localName: string | null
  notice: string | null
  onContinue: () => void
  onTrySample: () => void
  onCreate: (businessName: string, country: string) => void
  onMoveLocal: () => void
  onRestore: (file: File) => void
  onSignIn: () => void
  onSignOut: () => void
}

export function StartScreen({ accountEmail, busy, cloudName, localName, notice, onContinue, onTrySample, onCreate, onMoveLocal, onRestore, onSignIn, onSignOut }: StartScreenProps) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('IN')
  const [creating, setCreating] = useState(false)
  const trimmed = name.trim()
  const existingName = cloudName

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
          {!accountEmail && <article className="start-card start-card--primary">
            <LogIn size={20} />
            <h2>Your business</h2>
            <p>Sign in with Google to set up your business. It is saved to your Google account, so it opens on any device.</p>
            {localName && <p><strong>{localName}</strong> is saved in this browser. After signing in you can move it to your account.</p>}
            <Button disabled={busy} onClick={onSignIn} variant="primary">Sign in with Google</Button>
          </article>}
          {accountEmail && existingName && <article className="start-card start-card--primary">
            <Building2 size={20} />
            <h2>{existingName}</h2>
            <p>Pick up where you left off.</p>
            <Button icon={<ArrowRight size={15} />} onClick={onContinue} variant="primary">Continue</Button>
          </article>}
          {accountEmail && localName && <article className={`start-card ${existingName ? '' : 'start-card--primary'}`}>
            <CloudUpload size={20} />
            <h2>Move {localName} to your account</h2>
            <p>It is saved only in this browser. Move it to your account to open it on any device.{existingName ? ` This replaces ${existingName}, so download a backup of that first.` : ''}</p>
            <Button disabled={busy} onClick={onMoveLocal} variant={existingName ? 'secondary' : 'primary'}>Move to my account</Button>
          </article>}
          {accountEmail && <article className={`start-card ${existingName || localName ? '' : 'start-card--primary'}`}>
            <Building2 size={20} />
            <h2>{existingName ? 'Start a different business' : 'Set up my business'}</h2>
            <p>{existingName ? 'This replaces the saved workspace, so download a backup first.' : 'Start empty and add your locations, products, stock and orders at your own pace.'}</p>
            {!creating
              ? <Button onClick={() => setCreating(true)} variant={existingName || localName ? 'secondary' : 'primary'}>{existingName ? 'Start new' : 'Set up my business'}</Button>
              : <form className="start-form" onSubmit={submit}>
                <label htmlFor="business-name">Business name</label>
                <input autoFocus id="business-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya Traders" value={name} />
                <label htmlFor="business-country">Country</label>
                <select id="business-country" onChange={(event) => setCountry(event.target.value)} value={country}>
                  {supportedCountries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
                </select>
                <small>This sets your currency, number format and timezone.</small>
                <Button disabled={!trimmed || busy} type="submit" variant="primary">Create workspace</Button>
              </form>}
          </article>}
          <article className="start-card">
            <FlaskConical size={20} />
            <h2>Try the sample</h2>
            <p>A coffee distributor with a delayed shipment. No sign-up, nothing to enter.</p>
            <Button onClick={onTrySample} variant="secondary">Open the sample</Button>
          </article>
        </div>
        {accountEmail && <label className="start-restore"><Upload size={14} /> Restore from a backup file
          <input accept="application/json,.json" className="visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onRestore(file) }} type="file" />
        </label>}
        {accountEmail && <p className="start-account">Signed in as {accountEmail} · <button className="link-button" onClick={onSignOut} type="button">Sign out</button></p>}
      </main>
    </div>
  )
}
