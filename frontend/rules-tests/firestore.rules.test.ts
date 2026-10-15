import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, getDoc, getDocs, setDoc, deleteDoc } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'

let env: RulesTestEnvironment
const summary = { name: 'Priya Traders', country: 'IN', updatedAt: 1 }
const core = { json: '{}', chunkIds: [], revision: 1, updatedAt: 1 }
const chunk = { list: 'stock', index: 0, json: '[]' }
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
  it('lets the owner save, list and read several businesses', async () => {
    const db = env.authenticatedContext('alice').firestore()
    for (const path of [first, second]) {
      await assertSucceeds(setDoc(doc(db, path), summary))
      await assertSucceeds(setDoc(doc(db, `${path}/parts/core`), core))
      await assertSucceeds(setDoc(doc(db, `${path}/parts/stock-0`), chunk))
      await assertSucceeds(setDoc(doc(db, `${path}/parts/history-0`), { ...chunk, list: 'history' }))
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
    await assertFails(setDoc(doc(db, `${first}/parts/stock-12345`), chunk))
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
    await assertFails(setDoc(doc(db, `${first}/parts/stock-1`), { ...chunk, json: 'x'.repeat(700_001) }))
    await assertFails(setDoc(doc(db, `${first}/parts/stock-2`), { ...chunk, index: 'zero' }))
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
