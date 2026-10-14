import { describe, expect, it } from 'vitest'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import { sampleWorkspace } from '../../../shared/planner/sample'
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
