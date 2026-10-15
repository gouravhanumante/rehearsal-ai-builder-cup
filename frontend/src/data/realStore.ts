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

/** A business saved in this browser before sign-in existed. Read once to move it into the account, then cleared. */
export async function loadReal(): Promise<RealLoad> {
  const stored = await run<unknown>('readonly', (store) => store.get(KEY))
  if (stored === undefined) return null
  const workspace = parseWorkspace(stored)
  return workspace && workspace.mode === 'real' ? { workspace } : { error: 'Your saved workspace could not be read.' }
}

export async function clearReal(): Promise<void> {
  await run('readwrite', (store) => store.delete(KEY))
}
