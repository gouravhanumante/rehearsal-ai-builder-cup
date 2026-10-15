import { initializeApp } from 'firebase/app'
import { GoogleAuthProvider, getAuth, onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import { collection, doc, getDoc, getDocs, getFirestore, onSnapshot, runTransaction, writeBatch, type CollectionReference, type DocumentReference } from 'firebase/firestore'
import type { Workspace } from '../../../shared/planner/model'
import { diffChunks, joinWorkspace, splitWorkspace, type Chunk, type SyncedState } from './chunks'

// Public web-app identifiers, not secrets: access is decided by firestore.rules.
const app = initializeApp({
  apiKey: 'AIzaSyDCba_V4RWKq8T6vt3xd_x4U1ueyqeMzXk',
  authDomain: 'rehearsal-ai-builder-cup-2026.firebaseapp.com',
  projectId: 'rehearsal-ai-builder-cup-2026',
  appId: '1:542068090866:web:895ad7d27f80fb909ded6b',
})
const auth = getAuth(app)
const db = getFirestore(app)

export type Account = { uid: string; email: string | null }
export type CloudLoad = { workspace: Workspace } | { error: string } | null
export type BusinessSummary = { id: string; name: string; country: string; updatedAt: number }

/** Another device saved first; this one must reload instead of overwriting. */
export class ConflictError extends Error {}

// users/{uid}/businesses/{id} lists the business; its data is in users/{uid}/businesses/{id}/parts.
const businesses = (uid: string) => collection(db, 'users', uid, 'businesses')
const summaryRef = (uid: string, id: string) => doc(db, 'users', uid, 'businesses', id)
const parts = (uid: string, id: string) => collection(db, 'users', uid, 'businesses', id, 'parts')
const coreRef = (uid: string, id: string) => doc(parts(uid, id), 'core')
// The one-business layout used before several businesses were allowed.
const legacyFolder = (uid: string) => collection(db, 'users', uid, 'workspace')
// Firestore refuses one request over 10 MiB; stay well under it.
const MAX_REQUEST_BYTES = 8_000_000

type Synced = SyncedState & { key: string }
const keyOf = (uid: string, id: string) => `${uid}/${id}`
let synced: Synced = { key: '', revision: 0, hashes: {} }
let queue: Promise<unknown> = Promise.resolve()
// Our own save's notification can arrive before `synced` is updated, so notifications wait until saving stops.
let saving = 0
let seenRevision = 0
let reloadHandler: (() => void) | null = null
const reloadIfBehind = () => { if (saving === 0 && seenRevision > synced.revision) reloadHandler?.() }

export function watchAccount(onAccount: (account: Account | null) => void) {
  return onAuthStateChanged(auth, (user) => onAccount(user ? { uid: user.uid, email: user.email } : null))
}

export async function signInWithGoogle() {
  await signInWithPopup(auth, new GoogleAuthProvider())
}

export function currentAccount(): Account | null {
  const user = auth.currentUser
  return user ? { uid: user.uid, email: user.email } : null
}

export async function signOutNow() {
  synced = { key: '', revision: 0, hashes: {} }
  await signOut(auth)
}

async function readFrom(folder: CollectionReference, core: DocumentReference) {
  const coreDoc = await getDoc(core)
  if (!coreDoc.exists()) return null
  const data = coreDoc.data() as { json: string; chunkIds: string[]; revision: number }
  const wanted = new Set(data.chunkIds)
  const pieces = (await getDocs(folder)).docs
    .filter((item) => wanted.has(item.id))
    .map((item) => ({ id: item.id, ...(item.data() as Omit<Chunk, 'id'>) }))
  const workspace = pieces.length === wanted.size ? joinWorkspace(data.json, pieces) : null
  return { workspace: workspace?.mode === 'real' ? workspace : null, pieces, revision: data.revision }
}

/** A business saved under the one-business layout is copied into the list, then the old copy is removed. */
async function carryOverLegacy(uid: string) {
  const legacy = await readFrom(legacyFolder(uid), doc(legacyFolder(uid), 'core'))
  if (!legacy?.workspace) return
  await createBusiness(uid, legacy.workspace)
  const batch = writeBatch(db)
  for (const item of (await getDocs(legacyFolder(uid))).docs) batch.delete(item.ref)
  await batch.commit()
}

export async function listBusinesses(uid: string): Promise<BusinessSummary[]> {
  try { await carryOverLegacy(uid) } catch { /* the old copy stays where it is and is tried again next time */ }
  const found = (await getDocs(businesses(uid))).docs.map((item) => ({ id: item.id, ...(item.data() as Omit<BusinessSummary, 'id'>) }))
  return found.sort((first, second) => second.updatedAt - first.updatedAt)
}

/** `null` means the business is gone; an error means it exists but cannot be read. */
export async function loadBusiness(uid: string, id: string): Promise<CloudLoad> {
  const read = await readFrom(parts(uid, id), coreRef(uid, id))
  if (!read) return null
  if (!read.workspace) return { error: 'This business could not be read.' }
  const { hashes } = await diffChunks(read.pieces, {})
  synced = { key: keyOf(uid, id), revision: read.revision, hashes }
  return { workspace: read.workspace }
}

async function write(uid: string, id: string, workspace: Workspace) {
  const key = keyOf(uid, id)
  if (synced.key !== key) synced = { key, revision: 0, hashes: {} }
  const { coreJson, chunks } = splitWorkspace(workspace)
  const { write: changed, remove, hashes } = await diffChunks(chunks, synced.hashes)

  // A very large first save cannot fit in one request; its extra pieces go first, the core last.
  let inTransaction = changed
  let bytes = changed.reduce((total, chunk) => total + chunk.json.length, coreJson.length)
  if (bytes > MAX_REQUEST_BYTES) {
    inTransaction = []
    let batch = writeBatch(db)
    bytes = 0
    for (const chunk of changed) {
      if (bytes + chunk.json.length > MAX_REQUEST_BYTES) { await batch.commit(); batch = writeBatch(db); bytes = 0 }
      batch.set(doc(parts(uid, id), chunk.id), { list: chunk.list, index: chunk.index, json: chunk.json })
      bytes += chunk.json.length
    }
    await batch.commit()
  }

  const revision = await runTransaction(db, async (transaction) => {
    const current = await transaction.get(coreRef(uid, id))
    const stored = current.exists() ? (current.data() as { revision: number }).revision : 0
    if (stored !== synced.revision) throw new ConflictError('Changed on another device.')
    for (const chunk of inTransaction) transaction.set(doc(parts(uid, id), chunk.id), { list: chunk.list, index: chunk.index, json: chunk.json })
    const updatedAt = Date.now()
    transaction.set(coreRef(uid, id), { json: coreJson, chunkIds: chunks.map((chunk) => chunk.id), revision: stored + 1, updatedAt })
    transaction.set(summaryRef(uid, id), { name: workspace.businessName, country: workspace.settings.country, updatedAt })
    return stored + 1
  })
  synced = { key, revision, hashes }

  if (remove.length) {
    const batch = writeBatch(db)
    for (const chunkId of remove) batch.delete(doc(parts(uid, id), chunkId))
    await batch.commit()
  }
}

/** Saves run one after another, so two quick edits never race each other. */
export function saveBusiness(uid: string, id: string, workspace: Workspace): Promise<void> {
  const next = queue.then(async () => {
    saving += 1
    try { await write(uid, id, workspace) } finally { saving -= 1; reloadIfBehind() }
  })
  queue = next.catch(() => undefined)
  return next
}

/** A new business in the account; resolves with its id only after Firestore has confirmed the save. */
export async function createBusiness(uid: string, workspace: Workspace): Promise<string> {
  const id = doc(businesses(uid)).id
  await saveBusiness(uid, id, workspace)
  return id
}

export async function deleteBusiness(uid: string, id: string) {
  await queue
  const batch = writeBatch(db)
  for (const item of (await getDocs(parts(uid, id))).docs) batch.delete(item.ref)
  batch.delete(summaryRef(uid, id))
  await batch.commit()
  if (synced.key === keyOf(uid, id)) synced = { key: '', revision: 0, hashes: {} }
}

/** Calls `reload` when another device or tab saves a newer version of this business. */
export function onBusinessChanged(uid: string, id: string, reload: () => void) {
  reloadHandler = reload
  seenRevision = 0
  const stop = onSnapshot(coreRef(uid, id), (snapshot) => {
    if (snapshot.metadata.hasPendingWrites || !snapshot.exists() || synced.key !== keyOf(uid, id)) return
    seenRevision = Math.max(seenRevision, (snapshot.data() as { revision: number }).revision)
    reloadIfBehind()
  })
  return () => { stop(); if (reloadHandler === reload) reloadHandler = null }
}

export function describeCloudError(error: unknown) {
  if (error instanceof ConflictError) return 'This business was changed on another device or tab. Showing the latest version; make your last change again.'
  const code = (error as { code?: string } | null)?.code ?? ''
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return null
  if (code === 'auth/popup-blocked') return 'The sign-in window was blocked. Allow pop-ups for this site and try again.'
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not switched on for Rehearsal yet.'
  if (code === 'permission-denied') return 'Rehearsal was not allowed to save to your account. Sign out, sign in again and retry.'
  if (code === 'unavailable') return 'You seem to be offline. Your latest change is not saved yet; it will be lost if you close this page.'
  if (error instanceof Error && /too large/.test(error.message)) return error.message
  return 'Your latest change could not be saved to your account. Download a backup so nothing is lost.'
}
