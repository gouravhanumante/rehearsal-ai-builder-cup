import { useCallback, useEffect, useRef, useState } from 'react'
import { StartScreen } from './components/start/StartScreen'
import { ConfirmDialog } from './components/layout/ConfirmDialog'
import { WorkspaceScreen } from './WorkspaceScreen'
import { createBlankWorkspace } from '../../shared/planner/blank'
import type { Workspace } from '../../shared/planner/model'
import { sampleWorkspace } from '../../shared/planner/sample'
import { downloadBackup, parseBackup } from './data/backup'
import { clearDemo, loadDemo, onDemoChangedElsewhere, saveDemo } from './data/demoStore'
import { clearReal, loadReal } from './data/realStore'
import type { Account } from './cloud/cloudStore'
import './App.css'

const LAST_KEY = 'rehearsal.last'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024
const SAVED = 'Saved to your account'

// Firebase loads only when needed, so the sample opens without it.
let cloudModule: Promise<typeof import('./cloud/cloudStore')> | null = null
const cloud = () => (cloudModule ??= import('./cloud/cloudStore'))
const describe = async (error: unknown) => (await cloud()).describeCloudError(error)

type Session =
  | { phase: 'loading' }
  | { phase: 'start'; account: Account | null; cloudName: string | null; localName: string | null }
  | { phase: 'ready'; workspace: Workspace; revision: number }

const remember = (mode: 'demo' | 'real' | null) => {
  if (mode) localStorage.setItem(LAST_KEY, mode)
  else localStorage.removeItem(LAST_KEY)
}

/** A business saved in this browser before sign-in existed; offered once to move into the account. */
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
  const [busy, setBusy] = useState(false)
  const revision = useRef(0)

  const show = useCallback((workspace: Workspace) => {
    revision.current += 1
    setSession({ phase: 'ready', workspace, revision: revision.current })
  }, [])

  const showStart = useCallback(async (who: Account | null) => {
    const local = await browserBusiness()
    let cloudName: string | null = null
    if (who) {
      try {
        const loaded = await (await cloud()).loadCloud(who.uid)
        if (loaded && 'workspace' in loaded) cloudName = loaded.workspace.businessName
        else if (loaded) setNotice(`${loaded.error} Restore a backup file to continue.`)
      } catch (error) { setNotice(await describe(error)) }
    }
    setSession({ phase: 'start', account: who, cloudName, localName: local?.businessName ?? null })
  }, [])

  const openDemo = useCallback(() => {
    const result = loadDemo()
    remember('demo')
    setNotice(result.notice)
    show(result.workspace)
  }, [show])

  const openReal = useCallback(async (who: Account, message: string | null = null) => {
    try {
      const loaded = await (await cloud()).loadCloud(who.uid)
      if (loaded && 'workspace' in loaded) {
        remember('real')
        setSaveStatus(SAVED)
        setNotice(message)
        show(loaded.workspace)
        return
      }
    } catch (error) { setNotice(await describe(error)) }
    await showStart(who)
  }, [show, showStart])

  useEffect(() => {
    // Opening the page picks up where the user left off, or asks what they want to do.
    const last = localStorage.getItem(LAST_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last === 'demo') openDemo()
    let first = true
    let stop = () => {}
    let live = true
    cloud().then((module) => {
      if (!live) return
      stop = module.watchAccount((next) => {
        setAccount(next)
        if (!first) return
        first = false
        if (last === 'demo') return
        if (next && last === 'real') void openReal(next)
        else void showStart(next)
      })
    }).catch(() => {
      if (last !== 'demo') { setNotice('Rehearsal could not reach its sign-in service. Check the connection, or try the sample.'); void showStart(null) }
    })
    return () => { live = false; stop() }
  }, [openDemo, openReal, showStart])

  const mode = session.phase === 'ready' ? session.workspace.mode : null
  const uid = mode === 'real' ? account?.uid : undefined
  useEffect(() => {
    if (mode === 'demo') return onDemoChangedElsewhere((next) => show(next))
    if (!uid || !account) return
    let stop = () => {}
    let live = true
    void cloud().then((module) => {
      if (live) stop = module.onCloudChanged(uid, () => { void openReal(account, 'This business was updated on another device or tab, so the latest version is shown.') })
    })
    return () => { live = false; stop() }
  }, [mode, uid, account, show, openReal])

  const change = (next: Workspace) => {
    setSession((current) => (current.phase === 'ready' ? { ...current, workspace: next } : current))
    if (next.mode === 'demo') {
      saveDemo(next)
      return
    }
    if (!account) { setSaveStatus('Not saved'); setNotice('You are signed out, so this change was not saved. Sign in again to keep working.'); return }
    setSaveStatus('Saving…')
    cloud().then((module) => module.saveCloud(account.uid, next))
      .then(() => setSaveStatus(SAVED))
      .catch(async (error: unknown) => {
        setSaveStatus('Not saved')
        const module = await cloud()
        if (error instanceof module.ConflictError) void openReal(account, module.describeCloudError(error))
        else setNotice(module.describeCloudError(error))
      })
  }

  /** Saves a workspace as the account's business and opens it. */
  const saveAndOpen = async (workspace: Workspace, message: string | null) => {
    if (!account) { setNotice('Sign in with Google first.'); return false }
    setBusy(true)
    try {
      await (await cloud()).saveCloud(account.uid, workspace)
    } catch (error) {
      setNotice(await describe(error))
      return false
    } finally { setBusy(false) }
    remember('real')
    setSaveStatus(SAVED)
    setNotice(message)
    show(workspace)
    return true
  }

  const signIn = async () => {
    setNotice(null)
    try { await (await cloud()).signInWithGoogle() } catch (error) { setNotice(await describe(error)); return }
    const who = (await cloud()).currentAccount()
    if (who) { setAccount(who); await openReal(who) }
  }

  const signOut = async () => {
    setConfirmingDelete(false)
    try { await (await cloud()).signOutNow() } catch (error) { setNotice(await describe(error)); return }
    remember(null)
    setAccount(null)
    setSaveStatus(null)
    setNotice(null)
    await showStart(null)
  }

  const moveBrowserBusiness = async () => {
    const local = await browserBusiness()
    if (!local) { setNotice('There is no business saved in this browser any more.'); return }
    if (await saveAndOpen(local, `${local.businessName} is now saved to your account, so you can open it on any device.`)) {
      try { await clearReal() } catch { /* the account copy is what counts now */ }
    }
  }

  const create = (businessName: string, country: string) => {
    void saveAndOpen(createBlankWorkspace(businessName, country), null)
  }

  const restore = async (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) { setNotice('That file is too large to be a Rehearsal backup.'); return }
    const parsed = parseBackup(await file.text())
    if ('error' in parsed) { setNotice(parsed.error); return }
    await saveAndOpen(parsed.workspace, 'Your backup was restored.')
  }

  const deleteReal = async () => {
    setConfirmingDelete(false)
    if (!account) return
    try { await (await cloud()).deleteCloud(account.uid) } catch (error) { setNotice(await describe(error)); return }
    remember(null)
    setNotice('Your workspace was deleted from your account.')
    await showStart(account)
  }

  const resetDemo = () => {
    clearDemo()
    setNotice(null)
    show(sampleWorkspace)
  }

  if (session.phase === 'loading') return <div className="app-loading" role="status">Loading…</div>

  if (session.phase === 'start') {
    return <StartScreen
      accountEmail={session.account?.email ?? (session.account ? 'your Google account' : null)}
      busy={busy}
      cloudName={session.cloudName}
      localName={session.localName}
      notice={notice}
      onContinue={() => { if (session.account) void openReal(session.account) }}
      onCreate={create}
      onMoveLocal={() => void moveBrowserBusiness()}
      onRestore={(file) => void restore(file)}
      onSignIn={() => void signIn()}
      onSignOut={() => void signOut()}
      onTrySample={openDemo}
    />
  }

  const { workspace } = session
  return (
    <>
      <WorkspaceScreen
        key={session.revision}
        accountEmail={account?.email ?? null}
        notice={notice}
        onChange={change}
        onDelete={() => setConfirmingDelete(true)}
        onExport={() => downloadBackup(workspace)}
        onNotice={setNotice}
        onResetDemo={resetDemo}
        onRestore={(file) => void restore(file)}
        onSignOut={() => void signOut()}
        onSwitch={() => { setNotice(null); if (workspace.mode === 'demo') void showStart(account); else openDemo() }}
        saveStatus={saveStatus}
        workspace={workspace}
      />
      {confirmingDelete && <ConfirmDialog
        body="This removes your business data from your account, on every device. Download a backup first if you might want it back."
        confirmLabel="Delete workspace"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void deleteReal()}
        title="Delete this workspace?"
      />}
    </>
  )
}

export default App
