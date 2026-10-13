import { useState, type FormEvent } from 'react'
import { Bot, CircleAlert, Send, Sparkles, X } from 'lucide-react'
import { Button } from '../../design-system/Button'

const suggestions = [
  "Why can't I transfer all 14 cases today?",
  'How can I protect Common Ground Cafe’s order?',
]

type AskAiPanelProps = {
  onClose: () => void
}

export function AskAiPanel({ onClose }: AskAiPanelProps) {
  const [prompt, setPrompt] = useState('')
  const [notSent, setNotSent] = useState(false)

  const submitPrompt = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (prompt.trim()) setNotSent(true)
  }

  return (
    <div className="assistant-overlay">
      <button aria-label="Dismiss assistant panel" className="assistant-scrim" onClick={onClose} type="button" />
      <aside aria-labelledby="assistant-title" aria-modal="true" className="assistant-panel" role="dialog">
        <header className="assistant-header">
          <span className="assistant-icon"><Bot size={19} /></span>
          <div><h2 id="assistant-title">Ask AI</h2><p>Questions and recovery ideas</p></div>
          <Button aria-label="Close Ask AI" className="assistant-close" icon={<X size={18} />} onClick={onClose} title="Close" variant="quiet" />
        </header>
        <div className="assistant-body">
          <div className="assistant-status"><CircleAlert size={16} /><span><strong>Not connected yet</strong> · Your question stays here and is not sent.</span></div>
          <div className="assistant-intro">
            <Sparkles size={17} />
            <div><strong>Ask about this delay</strong><p>Get an explanation or explore another recovery idea. The planner checks every idea before it can be used.</p></div>
          </div>
          <p className="suggestion-label">TRY ASKING</p>
          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <button className="suggestion-chip" key={suggestion} onClick={() => { setPrompt(suggestion); setNotSent(false) }} type="button">{suggestion}</button>
            ))}
          </div>
          {notSent && <p aria-live="polite" className="not-sent-notice">Your question was not sent because Ask AI is not connected yet. Nothing was changed.</p>}
        </div>
        <form className="assistant-composer" onSubmit={submitPrompt}>
          <label className="visually-hidden" htmlFor="assistant-prompt">Ask a question about this disruption</label>
          <textarea id="assistant-prompt" onChange={(event) => { setPrompt(event.target.value); setNotSent(false) }} placeholder="Ask about orders, timing, or another plan..." value={prompt} />
          <div className="composer-footer"><span>Your question stays on this device until AI is connected.</span><Button aria-label="Send question" disabled={!prompt.trim()} icon={<Send size={15} />} type="submit" variant="primary">Send</Button></div>
        </form>
      </aside>
    </div>
  )
}
