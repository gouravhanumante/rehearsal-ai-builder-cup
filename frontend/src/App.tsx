import { useCallback, useEffect, useRef, useState } from 'react'
import { StartScreen } from './components/start/StartScreen'
import { ConfirmDialog } from './components/layout/ConfirmDialog'
import { WorkspaceScreen } from './WorkspaceScreen'
import { createBlankWorkspace } from '../../shared/planner/blank'
import type { Workspace } from '../../shared/planner/model'
import { sampleWorkspace } from '../../shared/planner/sample'
import { downloadBackup, parseBackup } from './data/backup'
import { clearDemo, loadDemo, onDemoChangedElsewhere, saveDemo } from './data/demoStore'
import { clearReal, describeStorageError, loadReal, onRealChangedElsewhere, saveReal } from './data/realStore'
import { moveGuestToAccount } from './data/moveGuest'
import type { Account, BusinessSummary } from './cloud/cloudStore'
import './App.css'

const LAST_KEY = 'rehearsal.last'
const LAST_BUSINESS_KEY = 'rehearsal.lastBusiness'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const SAVED = 'Saved to your account'
const SAVED_HERE = 'Saved in this browser only'

// Firebase loads only when needed, so the sample opens without it.
let cloudModule: Promise<typeof import('./cloud/cloudStore')> | null = null
const cloud = () => (cloudModule ??= import('./cloud/cloudStore'))
const describe = async (error: unknown) => (await cloud()).describeCloudError(error)

/** Where the open business is kept: the sample, a guest business in this browser, or one in the account. */
type Place = { kind: 'demo' } | { kind: 'guest' } | { kind: 'cloud'; id: string }

type Session =
  | { phase: 'loading' }
  | { phase: 'start'; account: Account | null; businesses: BusinessSummary[]; localName: string | null }
  | { phase: 'ready'; workspace: Workspace; place: Place; revision: number }

const remember = (place: Place | null) => {
  if (!place) { localStorage.removeItem(LAST_KEY); return }
  localStorage.setItem(LAST_KEY, place.kind === 'cloud' ? 'real' : place.kind)
  if (place.kind === 'cloud') localStorage.setItem(LAST_BUSINESS_KEY, place.id)
}

/** The guest business saved in this browser, if any. */
async function browserBusiness() {
  try {
    const real = await loadReal()
    return real && 'workspace' in real ? real.workspace : null
  } catch { return null }
}

function App() {
  const [session, setSession] = useState<Session>({ phase: 'loading' })
  const [account, setAccount] = useState<Account | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [askingSave, setAskingSave] = useState(false)
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)
  // The latest guest save; moving to the account waits for it so the last edit is included.
  const guestSaving = useRef<Promise<void>>(Promise.resolve())

  const show = useCallback((workspace: Workspace, place: Place) => {
    revision.current += 1
    remember(place)
    setSession({ phase: 'ready', workspace, place, revision: revision.current })
  }, [])

  const showStart = useCallback(async (who: Account | null) => {
    const local = await browserBusiness()
    let businesses: BusinessSummary[] = []
    if (who) {
      try { businesses = await (await cloud()).listBusinesses(who.uid) } catch (error) { setNotice(await describe(error)) }
    }
    setSaveStatus(null)
    setSession({ phase: 'start', account: who, businesses, localName: local?.businessName ?? null })
  }, [])

  const openDemo = useCallback(() => {
    const result = loadDemo()
    setNotice(result.notice)
    show(result.workspace, { kind: 'demo' })
  }, [show])

  const openGuest = useCallback(async (message: string | null = null) => {
    try {
      const loaded = await loadReal()
      if (loaded && 'workspace' in loaded) {
        setSaveStatus(SAVED_HERE)
        setNotice(message)
        show(loaded.workspace, { kind: 'guest' })
        return
      }
      if (loaded) setNotice(`${loaded.error} Restore a backup file to continue.`)
    } catch (error) { setNotice(describeStorageError(error)) }
    remember(null)
    await showStart(null)
  }, [show, showStart])

  const openBusiness = useCallback(async (who: Account, id: string, message: string | null = null) => {
    try {
      const loaded = await (await cloud()).loadBusiness(who.uid, id)
      if (loaded && 'workspace' in loaded) {
        setSaveStatus(SAVED)
        setNotice(message)
        show(loaded.workspace, { kind: 'cloud', id })
        return
      }
      if (loaded) setNotice(`${loaded.error} Restore a backup file to continue.`)
    } catch (error) { setNotice(await describe(error)) }
    remember(null)
    await showStart(who)
  }, [show, showStart])

  useEffect(() => {
    // Opening the page picks up where the user left off, or asks what they want to do.
    const last = localStorage.getItem(LAST_KEY)
    const lastBusiness = localStorage.getItem(LAST_BUSINESS_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last === 'demo') openDemo()
    else if (last === 'guest') void openGuest()
    let first = true
    let stop = () => {}
    let live = true
    cloud().then((module) => {
      if (!live) return
      stop = module.watchAccount((next) => {
        setAccount(next)
        if (!first) return
        first = false
        if (last === 'demo' || last === 'guest') return
        if (next && last === 'real' && lastBusiness) void openBusiness(next, lastBusiness)
        else void showStart(next)
      })
    }).catch(() => {
      if (last !== 'demo' && last !== 'guest') { setNotice('Rehearsal could not reach its sign-in service. Check the connection, start as a guest, or try the sample.'); void showStart(null) }
    })
    return () => { live = false; stop() }
  }, [openDemo, openGuest, openBusiness, showStart])

  const place = session.phase === 'ready' ? session.place : null
  const cloudId = place?.kind === 'cloud' ? place.id : null
  const placeKind = place?.kind ?? null
  useEffect(() => {
    if (placeKind === 'demo') return onDemoChangedElsewhere((next) => show(next, { kind: 'demo' }))
    if (placeKind === 'guest') return onRealChangedElsewhere(() => { void openGuest('This business was changed in another tab, so the latest version is shown.') })
    if (!cloudId || !account) return
    let stop = () => {}
    let live = true
    void cloud().then((module) => {
      if (live) stop = module.onBusinessChanged(account.uid, cloudId, () => { void openBusiness(account, cloudId, 'This business was updated on another device or tab, so the latest version is shown.') })
    })
    return () => { live = false; stop() }
  }, [placeKind, cloudId, account, show, openGuest, openBusiness])

  const change = (next: Workspace) => {
    if (session.phase !== 'ready') return
    setSession({ ...session, workspace: next })
    const where = session.place
    if (where.kind === 'demo') { saveDemo(next); return }
    if (where.kind === 'guest') {
      setSaveStatus('Saving…')
      guestSaving.current = saveReal(next)
        .then(() => setSaveStatus(SAVED_HERE))
        .catch((error: unknown) => { setSaveStatus('Not saved'); setNotice(describeStorageError(error)) })
      return
    }
    if (!account) { setSaveStatus('Not saved'); setNotice('You are signed out, so this change was not saved. Sign in again to keep working.'); return }
    setSaveStatus('Saving…')
    cloud().then((module) => module.saveBusiness(account.uid, where.id, next))
      .then(() => setSaveStatus(SAVED))
      .catch(async (error: unknown) => {
        setSaveStatus('Not saved')
        const module = await cloud()
        if (error instanceof module.ConflictError) void openBusiness(account, where.id, module.describeCloudError(error))
        else setNotice(module.describeCloudError(error))
      })
  }

  /** Signed in: a new business in the account. Signed out: the guest business in this browser. */
  const addAndOpen = async (workspace: Workspace, message: string | null) => {
    setBusy(true)
    try {
      if (account) {
        const id = await (await cloud()).createBusiness(account.uid, workspace)
        setSaveStatus(SAVED)
        setNotice(message)
        show(workspace, { kind: 'cloud', id })
      } else {
        await saveReal(workspace)
        setSaveStatus(SAVED_HERE)
        setNotice(message)
        show(workspace, { kind: 'guest' })
      }
    } catch (error) {
      setNotice(account ? await describe(error) : describeStorageError(error))
    } finally { setBusy(false) }
  }

  /** Copies the guest business into the account as a new business; the browser copy goes only after that succeeds. */
  const saveGuestToAccount = async (who: Account) => {
    setAskingSave(false)
    setBusy(true)
    try {
      const module = await cloud()
      const result = await moveGuestToAccount({
        finishGuestSave: () => guestSaving.current,
        loadGuest: browserBusiness,
        saveToAccount: (workspace) => module.createBusiness(who.uid, workspace),
        clearGuest: clearReal,
      })
      if (!result.moved) { setNotice('There is no business saved in this browser any more.'); await showStart(who); return }
      setSaveStatus(SAVED)
      setNotice(`${result.workspace.businessName} is now saved to your account, so you can open it on any device.${result.browserCopyLeft ? ' A copy is still in this browser; you can delete it from the start screen.' : ''}`)
      show(result.workspace, { kind: 'cloud', id: result.businessId })
    } catch (error) {
      setNotice(`${await describe(error) ?? 'It was not saved.'} Your business is still saved in this browser.`)
    } finally { setBusy(false) }
  }

  const signIn = async () => {
    setNotice(null)
    try { await (await cloud()).signInWithGoogle() } catch (error) { setNotice(await describe(error)); return null }
    const who = (await cloud()).currentAccount()
    if (who) setAccount(who)
    return who
  }

  const signInFromStart = async () => {
    const who = await signIn()
    if (who) await showStart(who)
  }

  /** From inside a guest business: sign in if needed, then ask before saving it to the account. */
  const offerSaveToAccount = async () => {
    const who = account ?? await signIn()
    if (who) setAskingSave(true)
  }

  const signOut = async () => {
    setConfirmingDelete(false)
    try { await (await cloud()).signOutNow() } catch (error) { setNotice(await describe(error)); return }
    remember(null)
    setAccount(null)
    setNotice(null)
    await showStart(null)
  }

  const create = (businessName: string, country: string) => {
    void addAndOpen(createBlankWorkspace(businessName, country), null)
  }

  const restore = async (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) { setNotice('That file is too large to be a Rehearsal backup.'); return }
    const parsed = parseBackup(await file.text())
    if ('error' in parsed) { setNotice(parsed.error); return }
    await addAndOpen(parsed.workspace, account ? `Your backup was restored as a new business, ${parsed.workspace.businessName}.` : 'Your backup was restored in this browser.')
  }

  const deleteOpen = async () => {
    setConfirmingDelete(false)
    if (session.phase !== 'ready') return
    const where = session.place
    if (where.kind === 'guest') {
      try { await clearReal() } catch (error) { setNotice(describeStorageError(error)); return }
      setNotice('Your business was deleted from this browser.')
    } else if (where.kind === 'cloud' && account) {
      try { await (await cloud()).deleteBusiness(account.uid, where.id) } catch (error) { setNotice(await describe(error)); return }
      setNotice(`${session.workspace.businessName} was deleted from your account.`)
    } else return
    remember(null)
    await showStart(account)
  }

  const resetDemo = () => {
    clearDemo()
    setNotice(null)
    show(sampleWorkspace, { kind: 'demo' })
  }

  if (session.phase === 'loading') return <div className="app-loading" role="status">Loading…</div>

  if (session.phase === 'start') {
    const who = session.account
    return <StartScreen
      accountEmail={who?.email ?? (who ? 'your Google account' : null)}
      busy={busy}
      businesses={session.businesses}
      localName={session.localName}
      notice={notice}
      onContinueGuest={() => void openGuest()}
      onCreate={create}
      onOpen={(id) => { if (who) void openBusiness(who, id) }}
      onRestore={(file) => void restore(file)}
      onSaveLocal={() => { if (who) void saveGuestToAccount(who) }}
      onSignIn={() => void signInFromStart()}
      onSignOut={() => void signOut()}
      onTrySample={openDemo}
    />
  }

  const { workspace, place: where } = session
  return (
    <>
      <WorkspaceScreen
        key={session.revision}
        accountEmail={where.kind === 'cloud' ? account?.email ?? null : null}
        notice={notice}
        onChange={change}
        onDelete={() => setConfirmingDelete(true)}
        onExport={() => downloadBackup(workspace)}
        onNotice={setNotice}
        onResetDemo={resetDemo}
        onRestore={(file) => void restore(file)}
        onSignOut={() => void signOut()}
        onSwitch={() => { setNotice(null); if (where.kind === 'demo') void showStart(account); else openDemo() }}
        onSwitchBusiness={where.kind === 'demo' ? null : () => { setNotice(null); void showStart(account) }}
        saveStatus={saveStatus}
        saveToAccount={where.kind === 'guest' && !busy ? { label: account ? 'Save to my account' : 'Sign in to save', onClick: () => void offerSaveToAccount() } : null}
        workspace={workspace}
      />
      {askingSave && account && <ConfirmDialog
        body={`It is added to your account next to any businesses already there, and opens on any device. The copy in this browser is removed only after your account confirms the save.`}
        cancelLabel="Not now"
        confirmLabel="Save to my account"
        onClose={() => setAskingSave(false)}
        onConfirm={() => void saveGuestToAccount(account)}
        title={`Save ${workspace.businessName} to your account?`}
      />}
      {confirmingDelete && <ConfirmDialog
        body={where.kind === 'guest'
          ? 'This removes your business data from this browser. Download a backup first if you might want it back.'
          : `This removes ${workspace.businessName} from your account, on every device. Your other businesses are kept. Download a backup first if you might want it back.`}
        confirmLabel="Delete business"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void deleteOpen()}
        title={`Delete ${workspace.businessName}?`}
      />}
    </>
  )
}

export default App
