import { useState } from 'react'
import { Copy, Mail } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { HistoryMessage } from '../../../../shared/planner/model'
import { mailtoLink } from '../../presentation/supplierAsk'

/** Ready-to-send texts: copy or open in email. Rehearsal never sends anything itself. */
export function ReadyMessages({ messages }: { messages: HistoryMessage[] }) {
  const [copied, setCopied] = useState<number | null>(null)
  const copy = async (index: number, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(index)
    } catch {
      setCopied(null)
    }
  }
  return (
    <ul className="ready-messages">
      {messages.map((message, index) => (
        <li key={`${message.to}-${index}`}>
          <div className="ready-message-head"><strong>To {message.to}</strong><small>{message.subject}</small></div>
          <pre className="ask-message">{message.body}</pre>
          <div className="ask-actions">
            <Button icon={<Copy size={14} />} onClick={() => copy(index, message.body)} variant="secondary">{copied === index ? 'Copied' : 'Copy message'}</Button>
            {message.email && <a className="ds-button ds-button--primary" href={mailtoLink([message.email], message.subject, message.body)}><Mail size={14} /> Email {message.to}</a>}
          </div>
        </li>
      ))}
    </ul>
  )
}
