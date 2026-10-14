import { describe, expect, it } from 'vitest'
import { emailOf } from './supplierAsk'

describe('which supplier contacts become an email link', () => {
  it('a plain email address does', () => {
    expect(emailOf(' orders@vibgyor.in ')).toBe('orders@vibgyor.in')
  })

  it('a contact that smuggles in extra recipients or a message does not', () => {
    expect(emailOf('a@b.com?bcc=rival@x.com')).toBeNull()
    expect(emailOf('a@b.com,rival@x.com')).toBeNull()
    expect(emailOf('a@b.com&body=pay me')).toBeNull()
  })

  it('a phone number or a name is shown as text, not a link', () => {
    expect(emailOf('+91 98200 12345')).toBeNull()
  })
})
