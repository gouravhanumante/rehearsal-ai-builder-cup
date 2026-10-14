import { describe, expect, it } from 'vitest'
import { askMessage, emailOf } from './supplierAsk'

describe('asking a backup supplier', () => {
  it('one message asks for everything missing that they supply', () => {
    const message = askMessage({ greeting: 'Hello Vibgyor', from: 'New Traders', items: [
      { what: '3 packages of Broom', to: 'Warehouse A', by: 'Fri, 16 Oct', unit: 'package' },
      { what: '5 packages of Pen set', to: 'Warehouse A', by: 'Sat, 17 Oct', unit: 'package' },
    ] })
    expect(message).toContain('- 3 packages of Broom to Warehouse A by Fri, 16 Oct')
    expect(message).toContain('- 5 packages of Pen set to Warehouse A by Sat, 17 Oct')
    expect(message).toContain('price per package')
  })
})

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
