import type { Workspace } from '../../../shared/planner/model'
import { parseWorkspace } from '../../../shared/planner/validate'

const DB_NAME = 'rehearsal'
const STORE = 'workspaces'
const KEY = 'real'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => request.result.createObjectStore(STORE)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error('Could not open browser storage.'))
  })
}

async function run<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const transaction = db.transaction(STORE, mode)
      const request = work(transaction.objectStore(STORE))
      transaction.oncomplete = () => resolve(request.result)
      transaction.onerror = () => reject(transaction.error ?? request.error)
      transaction.onabort = () => reject(transaction.error ?? new Error('Browser storage stopped the save.'))
    })
  } finally {
    db.close()
  }
}

export type RealLoad = { workspace: Workspace } | { error: string } | null

/** A guest business, saved only in this browser. Signing in offers to move it to the account. */
export async function loadReal(): Promise<RealLoad> {
  const stored = await run<unknown>('readonly', (store) => store.get(KEY))
  if (stored === undefined) return null
  const workspace = parseWorkspace(stored)
  return workspace && workspace.mode === 'real' ? { workspace } : { error: 'Your saved workspace could not be read.' }
}

export function describeStorageError(error: unknown) {
  const name = (error as { name?: string } | null)?.name
  if (name === 'QuotaExceededError') return 'This browser has no room left to save your workspace. Download a backup, free some space, and try again.'
  return 'Your latest change could not be saved in this browser. Download a backup so nothing is lost.'
}

// A channel never hears its own messages, so a tab does not reload itself every time it saves.
let channel: BroadcastChannel | null = null
function tabChannel() {
  if (typeof BroadcastChannel === 'undefined') return null
  channel ??= new BroadcastChannel('rehearsal-real')
  return channel
}

export async function saveReal(workspace: Workspace): Promise<void> {
  await run('readwrite', (store) => store.put(workspace, KEY))
  tabChannel()?.postMessage('changed')
}

export async function clearReal(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY))
  tabChannel()?.postMessage('changed')
}

/** Another tab saved or deleted the guest business; this tab should reload it rather than overwrite it. */
export function onRealChangedElsewhere(reload: () => void) {
  const shared = tabChannel()
  if (!shared) return () => {}
  shared.onmessage = reload
  return () => { shared.onmessage = null }
}
