import { describe, expect, it } from 'vitest'
import { createBlankWorkspace } from '../../../shared/planner/blank'
import type { Workspace } from '../../../shared/planner/model'
import { moveGuestToAccount, type MoveSteps } from './moveGuest'

// Priya made "Priya Traders" as a guest and now signs in. Whatever happens, she must not lose it.
function priya(overrides: Partial<MoveSteps> = {}) {
  const log: string[] = []
  let browser: Workspace | null = createBlankWorkspace('Priya Traders', 'IN')
  const account: Workspace[] = []
  const steps: MoveSteps = {
    finishGuestSave: async () => { log.push('finish guest save') },
    loadGuest: async () => { log.push('load guest'); return browser },
    saveToAccount: async (workspace) => { log.push('save to account'); account.push(workspace); return 'biz-1' },
    clearGuest: async () => { log.push('clear browser'); browser = null },
    ...overrides,
  }
  return { steps, log, account, browserCopy: () => browser }
}

describe('saving a guest business to the account', () => {
  it('saves to the account first and only then clears the browser copy', async () => {
    const { steps, log, account, browserCopy } = priya()
    await expect(moveGuestToAccount(steps)).resolves.toMatchObject({ moved: true, businessId: 'biz-1', browserCopyLeft: false })
    expect(log).toEqual(['finish guest save', 'load guest', 'save to account', 'clear browser'])
    expect(account.map((item) => item.businessName)).toEqual(['Priya Traders'])
    expect(browserCopy()).toBeNull()
  })

  it('keeps the browser copy when the account save fails, e.g. offline', async () => {
    const { steps, log, browserCopy } = priya({ saveToAccount: async () => { throw new Error('offline') } })
    await expect(moveGuestToAccount(steps)).rejects.toThrow('offline')
    expect(log).not.toContain('clear browser')
    expect(browserCopy()?.businessName).toBe('Priya Traders')
  })

  it("waits for Priya's last edit to finish saving in the browser before copying it", async () => {
    let finishLastEdit = () => {}
    const lastEdit = new Promise<void>((resolve) => { finishLastEdit = resolve })
    const { steps, log } = priya({ finishGuestSave: () => lastEdit.then(() => { log.push('finish guest save') }) })
    const moving = moveGuestToAccount(steps)
    await Promise.resolve()
    expect(log).toEqual([])
    finishLastEdit()
    await moving
    expect(log[0]).toBe('finish guest save')
  })

  it('reports a browser copy left behind when clearing it fails, without undoing the account save', async () => {
    const { steps, account } = priya({ clearGuest: async () => { throw new Error('storage busy') } })
    await expect(moveGuestToAccount(steps)).resolves.toMatchObject({ moved: true, browserCopyLeft: true })
    expect(account).toHaveLength(1)
  })

  it('does nothing when there is no guest business', async () => {
    const { steps, log } = priya({ loadGuest: async () => null })
    await expect(moveGuestToAccount(steps)).resolves.toEqual({ moved: false, reason: 'nothing-to-move' })
    expect(log).not.toContain('save to account')
  })
})
