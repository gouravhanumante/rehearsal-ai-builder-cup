import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { ConflictError, publishCore } from '../src/cloud/publish'

let env: RulesTestEnvironment
const summary = { name: 'Priya Traders', country: 'IN', updatedAt: 1 }
const core = { json: '{}', chunkIds: [], revision: 1, updatedAt: 1 }
const chunk = { list: 'movements', index: 0, json: '[]' }
const first = 'users/alice/businesses/traders'
const second = 'users/alice/businesses/beverages'

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'rehearsal-rules-test',
    firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync('../firestore.rules', 'utf8') },
  })
})
beforeEach(async () => { await env.clearFirestore() })
afterAll(async () => { await env.cleanup() })

const seedAlice = () => env.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore()
  for (const path of [first, second]) {
    await setDoc(doc(db, path), summary)
    await setDoc(doc(db, `${path}/parts/core`), core)
  }
  await setDoc(doc(db, 'users/alice/workspace/core'), core)
})

describe('who can see and change a saved business', () => {
  it('lets only the owner save and read stock movements', async () => {
    const alice = env.authenticatedContext('alice').firestore()
    const path = `${first}/parts/movements-0-${'a'.repeat(32)}`
    await assertSucceeds(setDoc(doc(alice, path), { ...chunk, list: 'movements' }))
    await assertSucceeds(getDoc(doc(alice, path)))
    await assertFails(setDoc(doc(alice, path), { ...chunk, list: 'movements', json: '[{"tampered":true}]' }))
    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bob, path)))
    await assertFails(setDoc(doc(bob, path), { ...chunk, list: 'movements' }))
    await assertFails(deleteDoc(doc(bob, path)))
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), path)))
  })

  it('lets the owner save, list and read several businesses', async () => {
    const db = env.authenticatedContext('alice').firestore()
    for (const path of [first, second]) {
      await assertSucceeds(setDoc(doc(db, path), summary))
      await assertSucceeds(setDoc(doc(db, `${path}/parts/core`), core))
      await assertSucceeds(setDoc(doc(db, `${path}/parts/movements-0-${'a'.repeat(32)}`), chunk))
      await assertSucceeds(setDoc(doc(db, `${path}/parts/history-0-${'b'.repeat(32)}`), { ...chunk, list: 'history' }))
    }
    await assertSucceeds(getDocs(collection(db, 'users/alice/businesses')))
    await assertSucceeds(getDoc(doc(db, `${second}/parts/core`)))
  })

  it("does not let anyone else list, read, change or delete them, including Alice's second business", async () => {
    await seedAlice()
    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(getDocs(collection(bob, 'users/alice/businesses')))
    await assertFails(getDoc(doc(bob, `${second}/parts/core`)))
    await assertFails(setDoc(doc(bob, `${second}/parts/core`), core))
    await assertFails(setDoc(doc(bob, 'users/alice/businesses/planted'), summary))
    await assertFails(deleteDoc(doc(bob, second)))
  })

  it('does not let a signed-out visitor read or write anything', async () => {
    await seedAlice()
    const anonymous = env.unauthenticatedContext().firestore()
    await assertFails(getDocs(collection(anonymous, 'users/alice/businesses')))
    await assertFails(getDoc(doc(anonymous, `${first}/parts/core`)))
    await assertFails(setDoc(doc(anonymous, first), summary))
  })

  it('does not let the owner park arbitrary documents in the project', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, `${first}/parts/anything`), core))
    await assertFails(setDoc(doc(db, `${first}/parts/movements-12345-${'a'.repeat(32)}`), chunk))
    await assertFails(setDoc(doc(db, `${first}/elsewhere/core`), core))
    await assertFails(setDoc(doc(db, 'users/alice/businesses/bad id!'), summary))
    await assertFails(setDoc(doc(db, 'public/note'), core))
  })

  it('rejects documents with extra fields, wrong types or oversized bodies', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, first), { ...summary, extra: 'x' }))
    await assertFails(setDoc(doc(db, first), { ...summary, name: '' }))
    await assertFails(setDoc(doc(db, first), { ...summary, country: 'India' }))
    await assertFails(setDoc(doc(db, `${first}/parts/core`), { ...core, extra: 'x' }))
    await assertFails(setDoc(doc(db, `${first}/parts/movements-1-${'b'.repeat(32)}`), { ...chunk, json: 'x'.repeat(700_001) }))
    await assertFails(setDoc(doc(db, `${first}/parts/movements-2-${'c'.repeat(32)}`), { ...chunk, index: 'zero' }))
    await assertFails(setDoc(doc(db, `${first}/parts/stock-0`), { ...chunk, list: 'stock' }))
  })

  it('lets the owner read and remove the old one-business copy, but nobody can write it any more', async () => {
    await seedAlice()
    const alice = env.authenticatedContext('alice').firestore()
    await assertSucceeds(getDoc(doc(alice, 'users/alice/workspace/core')))
    await assertFails(setDoc(doc(alice, 'users/alice/workspace/core'), core))
    await assertFails(getDoc(doc(env.authenticatedContext('bob').firestore(), 'users/alice/workspace/core')))
    await assertSucceeds(deleteDoc(doc(alice, 'users/alice/workspace/core')))
  })
})

describe('two devices booking the same stock at once', () => {
  // Both phones loaded revision 1, when South Hub still had 6 free cases. Each books those 6 for a different warehouse.
  const booking = (to: string) => ({ json: JSON.stringify({ bookedFromSouth: 6, to }), chunkIds: [] })
  const name = { name: 'Priya Traders', country: 'IN' }

  it('exactly one save wins; the other is refused as changed on another device, and nothing is overwritten', async () => {
    await seedAlice()
    const phoneA = env.authenticatedContext('alice').firestore()
    const phoneB = env.authenticatedContext('alice').firestore()
    const results = await Promise.allSettled([
      publishCore(phoneA, 'alice', 'traders', 1, booking('north'), name),
      publishCore(phoneB, 'alice', 'traders', 1, booking('east'), name),
    ])
    const won = results.filter((result) => result.status === 'fulfilled')
    const refused = results.filter((result) => result.status === 'rejected')
    expect(won).toHaveLength(1)
    expect(refused).toHaveLength(1)
    expect((refused[0] as PromiseRejectedResult).reason).toBeInstanceOf(ConflictError)
    const saved = (await getDoc(doc(phoneA, `${first}/parts/core`))).data() as { json: string; revision: number }
    expect(saved.revision).toBe(2)
    expect([booking('north').json, booking('east').json]).toContain(saved.json)
  })

  it('a phone that saves after the other already did is refused, even with no race', async () => {
    await seedAlice()
    const phoneA = env.authenticatedContext('alice').firestore()
    const phoneB = env.authenticatedContext('alice').firestore()
    await publishCore(phoneA, 'alice', 'traders', 1, booking('north'), name)
    await expect(publishCore(phoneB, 'alice', 'traders', 1, booking('east'), name)).rejects.toBeInstanceOf(ConflictError)
    expect(((await getDoc(doc(phoneA, `${first}/parts/core`))).data() as { json: string }).json).toBe(booking('north').json)
  })
})
