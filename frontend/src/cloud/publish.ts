import { doc, runTransaction, type Firestore } from 'firebase/firestore'

/** Another device saved first; this one must reload instead of overwriting. */
export class ConflictError extends Error {}

/**
 * Makes a new version of a business current, but only if nobody saved since `expectedRevision`.
 * Firestore retries the transaction when two devices race, so exactly one of them wins.
 */
export function publishCore(db: Firestore, uid: string, id: string, expectedRevision: number, core: { json: string; chunkIds: string[] }, summary: { name: string; country: string }) {
  const coreRef = doc(db, 'users', uid, 'businesses', id, 'parts', 'core')
  const summaryRef = doc(db, 'users', uid, 'businesses', id)
  return runTransaction(db, async (transaction) => {
    const current = await transaction.get(coreRef)
    const oldChunkIds = current.exists() ? ((current.data() as { chunkIds: string[] }).chunkIds ?? []) : []
    const stored = current.exists() ? (current.data() as { revision: number }).revision : 0
    if (stored !== expectedRevision) throw new ConflictError('Changed on another device.')
    const updatedAt = Date.now()
    transaction.set(coreRef, { json: core.json, chunkIds: core.chunkIds, revision: stored + 1, updatedAt })
    transaction.set(summaryRef, { ...summary, updatedAt })
    return { revision: stored + 1, oldChunkIds }
  })
}
