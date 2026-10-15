import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore'
import { afterAll, beforeAll, describe, it } from 'vitest'

let env: RulesTestEnvironment
const core = { json: '{}', chunkIds: [], revision: 1, updatedAt: 1 }
const chunk = { list: 'stock', index: 0, json: '[]' }

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'rehearsal-rules-test',
    firestore: { host: '127.0.0.1', port: 8085, rules: readFileSync('../firestore.rules', 'utf8') },
  })
})
afterAll(async () => { await env.cleanup() })

describe('who can see and change a saved workspace', () => {
  it('lets the owner save and read their own workspace', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertSucceeds(setDoc(doc(db, 'users/alice/workspace/core'), core))
    await assertSucceeds(setDoc(doc(db, 'users/alice/workspace/stock-0'), chunk))
    await assertSucceeds(getDoc(doc(db, 'users/alice/workspace/core')))
  })

  it("does not let anyone else read or change it", async () => {
    await env.withSecurityRulesDisabled(async (context) => { await setDoc(doc(context.firestore(), 'users/alice/workspace/core'), core) })
    const bob = env.authenticatedContext('bob').firestore()
    await assertFails(getDoc(doc(bob, 'users/alice/workspace/core')))
    await assertFails(setDoc(doc(bob, 'users/alice/workspace/core'), core))
    await assertFails(deleteDoc(doc(bob, 'users/alice/workspace/core')))
  })

  it('does not let a signed-out visitor read or write anything', async () => {
    const anonymous = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(anonymous, 'users/alice/workspace/core')))
    await assertFails(setDoc(doc(anonymous, 'users/alice/workspace/core'), core))
  })

  it('does not let the owner park arbitrary documents in the project', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'users/alice/workspace/anything'), core))
    await assertFails(setDoc(doc(db, 'users/alice/workspace/stock-12345'), chunk))
    await assertFails(setDoc(doc(db, 'users/alice/elsewhere/core'), core))
    await assertFails(setDoc(doc(db, 'public/note'), core))
  })

  it('rejects a document with extra fields or an oversized body', async () => {
    const db = env.authenticatedContext('alice').firestore()
    await assertFails(setDoc(doc(db, 'users/alice/workspace/core'), { ...core, extra: 'x' }))
    await assertFails(setDoc(doc(db, 'users/alice/workspace/stock-1'), { ...chunk, json: 'x'.repeat(700_001) }))
    await assertFails(setDoc(doc(db, 'users/alice/workspace/stock-2'), { ...chunk, index: 'zero' }))
  })
})
