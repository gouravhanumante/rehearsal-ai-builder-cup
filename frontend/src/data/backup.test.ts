import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../../shared/planner/model'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { correctMovement, countStock, sendOrder } from '../../../shared/planner/ledger'
import { sampleEvidence, sampleWorkspace } from '../../../shared/planner/sample'
import { backupFileName, parseBackup, serializeBackup } from './backup'

describe('backup files', () => {
  const mine = createBlankWorkspace('Priya Traders', 'IN')

  it('restores exactly what was backed up', () => {
    const restored = parseBackup(serializeBackup(mine))
    expect('workspace' in restored && restored.workspace).toEqual(mine)
  })

  it('names the file after the business and the day', () => {
    expect(backupFileName(mine, new Date('2026-10-15T09:00:00Z'))).toBe('rehearsal-priya-traders-2026-10-15.json')
  })

  it('refuses a file that is not a Rehearsal backup', () => {
    expect(parseBackup('{"hello":1}')).toEqual({ error: 'That file is not a Rehearsal backup.' })
    expect(parseBackup('not json at all')).toEqual({ error: 'That file is not a Rehearsal backup.' })
  })

  it('refuses a backup whose data is damaged', () => {
    const damaged = JSON.stringify({ app: 'rehearsal-backup', workspace: { ...mine, stock: [{ locationId: 'x', productId: 'y', available: { value: -3 } }] } })
    expect('error' in parseBackup(damaged)).toBe(true)
  })

  it('turns a backed-up sample into the user\'s own workspace, so the shared sample cannot be overwritten', () => {
    const restored = parseBackup(serializeBackup(sampleWorkspace))
    expect('workspace' in restored && restored.workspace.mode).toBe('real')
  })
})

describe('a backup whose history could not have happened', () => {
  // Harbor Market (ORD-1086) ordered 12; 4 were sent, then 4 corrected to 3 after a recount.
  const sent = sendOrder({ ...sampleWorkspace, orders: sampleWorkspace.orders.map((order) => order.id === 'ORD-1086' ? { ...order, splitAllowed: true } : order) }, 'ORD-1086', [{ productId: 'harbor-blend', quantity: 4 }], '2026-10-15T09:30:00+05:30', 'DSP-1')
  if ('error' in sent) throw new Error(sent.error)
  const recounted = countStock(sent.workspace, 'north', 'harbor-blend', 10, sampleEvidence, '2026-10-15T10:00:00+05:30', 'CNT-2')
  if ('error' in recounted) throw new Error(recounted.error)
  const corrected = correctMovement(recounted.workspace, 'DSP-1:harbor-blend', 3, '2026-10-15T11:00:00+05:30', 'COR-1')
  if ('error' in corrected) throw new Error(corrected.error)
  const real = corrected.workspace
  const tampered = (change: (workspace: Workspace) => Workspace) => JSON.stringify({ app: 'rehearsal-backup', workspace: change(real) })

  it('restores a real history: a partial send, a recount and a correction', () => {
    expect('workspace' in parseBackup(serializeBackup(real))).toBe(true)
  })

  it('refuses 500 more sent on a 12-case order, even when a later count hides it from stock', () => {
    const extra = tampered((workspace) => ({ ...workspace, movements: [...workspace.movements, { ...workspace.movements[2], id: 'X', quantity: 500 }] }))
    expect(parseBackup(extra)).toEqual({ error: 'The backup says 503 cases of Harbor Blend Coffee were sent for ORD-1086, but that order is for 12. It was not restored.' })
  })

  it('refuses a send for an order that is not in the backup', () => {
    const orphan = tampered((workspace) => ({ ...workspace, orders: workspace.orders.filter((order) => order.id !== 'ORD-1086') }))
    expect(parseBackup(orphan)).toEqual({ error: 'The backup records goods sent for ORD-1086, but that order is not in it. It was not restored.' })
  })
})
