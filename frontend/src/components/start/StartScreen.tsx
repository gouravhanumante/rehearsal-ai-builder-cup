import { useState, type FormEvent } from 'react'
import { ArrowRight, Building2, CloudUpload, FlaskConical, HardDrive, LogIn, Plus, Upload } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { supportedCountries } from '../../../../shared/planner/countries'
import type { BusinessSummary } from '../../cloud/cloudStore'

type StartScreenProps = {
  /** Null when signed out. */
  accountEmail: string | null
  busy: boolean
  businesses: BusinessSummary[]
  /** The guest business saved in this browser, if any. */
  localName: string | null
  notice: string | null
  onOpen: (businessId: string) => void
  onContinueGuest: () => void
  onTrySample: () => void
  onCreate: (businessName: string, country: string) => void
  onSaveLocal: () => void
  onRestore: (file: File) => void
  onSignIn: () => void
  onSignOut: () => void
}

function NewBusinessForm({ busy, label, onCreate }: { busy: boolean; label: string; onCreate: (businessName: string, country: string) => void }) {
  const [name, setName] = useState('')
  const [country, setCountry] = useState('IN')
  const trimmed = name.trim()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (trimmed) onCreate(trimmed, country)
  }
  return (
    <form className="start-form" onSubmit={submit}>
      <label htmlFor="business-name">Business name</label>
      <input autoFocus id="business-name" maxLength={80} onChange={(event) => setName(event.target.value)} placeholder="e.g. Priya Traders" value={name} />
      <label htmlFor="business-country">Country</label>
      <select id="business-country" onChange={(event) => setCountry(event.target.value)} value={country}>
        {supportedCountries.map((item) => <option key={item.code} value={item.code}>{item.name}</option>)}
      </select>
      <small>This sets your currency, number format and timezone.</small>
      <Button disabled={!trimmed || busy} type="submit" variant="primary">{label}</Button>
    </form>
  )
}

const savedOn = (time: number) => new Date(time).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const countryName = (code: string) => supportedCountries.find((item) => item.code === code)?.name ?? code

export function StartScreen({ accountEmail, busy, businesses, localName, notice, onOpen, onContinueGuest, onTrySample, onCreate, onSaveLocal, onRestore, onSignIn, onSignOut }: StartScreenProps) {
  const [creating, setCreating] = useState(false)
  const signedIn = accountEmail !== null

  return (
    <div className="start-screen">
      <header className="start-brand"><span className="brand-mark">R</span><span>rehearsal<span className="brand-period">.</span></span></header>
      <main className="start-main">
        <h1>Know what breaks before it does.</h1>
        <p className="start-lead">Tell Rehearsal about your stock, orders and suppliers once. When a shipment is late, it shows which customers are affected and checks every way out before you act.</p>
        {notice && <p className="storage-notice start-notice" role="status">{notice}</p>}

        {signedIn && businesses.length > 0 && <section aria-label="Your businesses" className="start-businesses">
          <h2>Your businesses</h2>
          <ul>
            {businesses.map((business) => (
              <li key={business.id}>
                <Building2 size={18} />
                <span><strong>{business.name}</strong><small>{countryName(business.country)} · saved {savedOn(business.updatedAt)}</small></span>
                <Button aria-label={`Open ${business.name}`} disabled={busy} icon={<ArrowRight size={15} />} onClick={() => onOpen(business.id)} variant="primary">Open</Button>
              </li>
            ))}
          </ul>
        </section>}

        <div className="start-cards">
          {!signedIn && <article className="start-card start-card--primary">
            <LogIn size={20} />
            <h2>Sign in</h2>
            <p>Save your businesses to your Google account, so they open on any device.{localName ? ` You can save ${localName} to it after signing in.` : ''}</p>
            <Button disabled={busy} onClick={onSignIn} variant="primary">Sign in with Google</Button>
          </article>}

          {localName && <article className={`start-card ${signedIn ? 'start-card--primary' : ''}`}>
            <HardDrive size={20} />
            <h2>{localName}</h2>
            <p>Saved only in this browser.{signedIn ? ' Save it to your account to open it on any device; it is added next to your other businesses.' : ''}</p>
            {signedIn && <Button disabled={busy} icon={<CloudUpload size={15} />} onClick={onSaveLocal} variant="primary">Save to my account</Button>}
            <Button disabled={busy} onClick={onContinueGuest} variant="secondary">{signedIn ? 'Keep using it here' : 'Continue without signing in'}</Button>
          </article>}

          {!signedIn && !localName && <article className="start-card">
            <HardDrive size={20} />
            <h2>Start without signing in</h2>
            <p>Your business is saved only in this browser. Sign in any time later to save it to your account.</p>
            {creating ? <NewBusinessForm busy={busy} label="Start" onCreate={onCreate} /> : <Button onClick={() => setCreating(true)} variant="secondary">Start as a guest</Button>}
          </article>}

          {signedIn && <article className={`start-card ${businesses.length === 0 && !localName ? 'start-card--primary' : ''}`}>
            <Plus size={20} />
            <h2>{businesses.length > 0 ? 'Add another business' : 'Set up my business'}</h2>
            <p>Start empty and add your locations, products, stock and orders at your own pace.</p>
            {creating
              ? <NewBusinessForm busy={busy} label="Create business" onCreate={onCreate} />
              : <Button onClick={() => setCreating(true)} variant={businesses.length === 0 && !localName ? 'primary' : 'secondary'}>{businesses.length > 0 ? 'Add business' : 'Set up my business'}</Button>}
          </article>}

          <article className="start-card">
            <FlaskConical size={20} />
            <h2>Try the sample</h2>
            <p>A coffee distributor with a delayed shipment. No sign-up, nothing to enter.</p>
            <Button onClick={onTrySample} variant="secondary">Open the sample</Button>
          </article>
        </div>

        {(signedIn || !localName) && <label className="start-restore"><Upload size={14} /> {signedIn ? 'Restore a backup file as a new business' : 'Restore a backup file into this browser'}
          <input accept="application/json,.json" className="visually-hidden" onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onRestore(file) }} type="file" />
        </label>}
        {signedIn && <p className="start-account">Signed in as {accountEmail} · <button className="link-button" onClick={onSignOut} type="button">Sign out</button></p>}
      </main>
    </div>
  )
}
