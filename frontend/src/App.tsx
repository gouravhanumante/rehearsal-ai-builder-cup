import { useCallback, useEffect, useRef, useState } from 'react'
import { StartScreen } from './components/start/StartScreen'
import { ConfirmDialog } from './components/layout/ConfirmDialog'
import { WorkspaceScreen } from './WorkspaceScreen'
import { createBlankWorkspace } from '../../shared/planner/blank'
import type { Workspace } from '../../shared/planner/model'
import { sampleWorkspace } from '../../shared/planner/sample'
import { downloadBackup, parseBackup } from './data/backup'
import { clearDemo, loadDemo, onDemoChangedElsewhere, saveDemo } from './data/demoStore'
import { clearReal, describeStorageError, loadReal, onRealChangedElsewhere, requestPersistentStorage, saveReal } from './data/realStore'
import './App.css'

const LAST_KEY = 'rehearsal.last'
const MAX_BACKUP_BYTES = 100 * 1024 * 1024

type Session =
  | { phase: 'loading' }
  | { phase: 'start'; existingName: string | null }
  | { phase: 'ready'; workspace: Workspace; revision: number }

const remember = (mode: 'demo' | 'real' | null) => {
  if (mode) localStorage.setItem(LAST_KEY, mode)
  else localStorage.removeItem(LAST_KEY)
}

function App() {
  const [session, setSession] = useState<Session>({ phase: 'loading' })
  const [notice, setNotice] = useState<string | null>(null)
  const [saveStatus, setSaveStatus] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const revision = useRef(0)

  const show = useCallback((workspace: Workspace) => {
    revision.current += 1
    setSession({ phase: 'ready', workspace, revision: revision.current })
  }, [])

  const showStart = useCallback(async () => {
    let existingName: string | null = null
    try {
      const real = await loadReal()
      if (real && 'workspace' in real) existingName = real.workspace.businessName
      else if (real) setNotice(`${real.error} Restore a backup file to continue.`)
    } catch { /* storage unavailable: start without a saved workspace */ }
    setSession({ phase: 'start', existingName })
  }, [])

  const openDemo = useCallback(() => {
    const result = loadDemo()
    remember('demo')
    setNotice(result.notice)
    show(result.workspace)
  }, [show])

  const openReal = useCallback(async () => {
    try {
      const real = await loadReal()
      if (real && 'workspace' in real) {
        remember('real')
        setSaveStatus('Saved in this browser')
        setNotice(null)
        show(real.workspace)
        return
      }
    } catch { /* fall through to the start screen */ }
    await showStart()
  }, [show, showStart])

  useEffect(() => {
    // Opening the page picks up where the user left off, or asks what they want to do.
    const last = localStorage.getItem(LAST_KEY)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (last === 'demo') openDemo()
    else if (last === 'real') void openReal()
    else void showStart()
  }, [openDemo, openReal, showStart])

  const mode = session.phase === 'ready' ? session.workspace.mode : null
  useEffect(() => {
    if (mode === 'demo') return onDemoChangedElsewhere((next) => show(next))
    if (mode === 'real') return onRealChangedElsewhere(() => { void openReal() })
  }, [mode, show, openReal])

  const change = (next: Workspace) => {
    setSession((current) => (current.phase === 'ready' ? { ...current, workspace: next } : current))
    if (next.mode === 'demo') {
      saveDemo(next)
      return
    }
    setSaveStatus('Saving…')
    saveReal(next)
      .then(() => setSaveStatus('Saved in this browser'))
      .catch((error: unknown) => { setSaveStatus('Not saved'); setNotice(describeStorageError(error)) })
  }

  const create = async (businessName: string, country: string) => {
    const workspace = createBlankWorkspace(businessName, country)
    try {
      await saveReal(workspace)
    } catch (error) {
      setNotice(describeStorageError(error))
      return
    }
    void requestPersistentStorage()
    remember('real')
    setSaveStatus('Saved in this browser')
    setNotice(null)
    show(workspace)
  }

  const restore = async (file: File) => {
    if (file.size > MAX_BACKUP_BYTES) { setNotice('That file is too large to be a Rehearsal backup.'); return }
    const parsed = parseBackup(await file.text())
    if ('error' in parsed) { setNotice(parsed.error); return }
    try {
      await saveReal(parsed.workspace)
    } catch (error) {
      setNotice(describeStorageError(error))
      return
    }
    void requestPersistentStorage()
    remember('real')
    setSaveStatus('Saved in this browser')
    setNotice('Your backup was restored.')
    show(parsed.workspace)
  }

  const deleteReal = async () => {
    setConfirmingDelete(false)
    try { await clearReal() } catch (error) { setNotice(describeStorageError(error)); return }
    remember(null)
    setNotice('Your workspace was deleted from this browser.')
    setSession({ phase: 'start', existingName: null })
  }

  const resetDemo = () => {
    clearDemo()
    setNotice(null)
    show(sampleWorkspace)
  }

  if (session.phase === 'loading') return <div className="app-loading" role="status">Loading…</div>

  if (session.phase === 'start') {
    return <StartScreen existingName={session.existingName} notice={notice} onContinue={() => void openReal()} onCreate={(name, country) => void create(name, country)} onRestore={(file) => void restore(file)} onTrySample={openDemo} />
  }

  const { workspace } = session
  return (
    <>
      <WorkspaceScreen
        key={session.revision}
        notice={notice}
        onChange={change}
        onDelete={() => setConfirmingDelete(true)}
        onExport={() => downloadBackup(workspace)}
        onNotice={setNotice}
        onResetDemo={resetDemo}
        onRestore={(file) => void restore(file)}
        onSwitch={() => { if (workspace.mode === 'demo') { setNotice(null); void showStart() } else openDemo() }}
        saveStatus={saveStatus}
        workspace={workspace}
      />
      {confirmingDelete && <ConfirmDialog
        body="This removes your business data from this browser. Download a backup first if you might want it back."
        confirmLabel="Delete workspace"
        onClose={() => setConfirmingDelete(false)}
        onConfirm={() => void deleteReal()}
        title="Delete this workspace?"
      />}
    </>
  )
}

export default App
