import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Bot, CheckCircle2, CircleAlert, LoaderCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { buildAssistantContext } from '../../domain/assistantContext'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type ServiceState = 'checking' | 'ready' | 'missing-key' | 'offline'

type AssistantReply = {
  answer: string
  referencedOptionIds: string[]
  recommendedOptionId: string | null
}

type ShownOption = { id: string; title: string; status: string; outcome: string; cost: string; label: string; recommended: boolean }
/** One question and its answer. Options are kept as they were then, since option numbers change with the data. */
export type ChatTurn = { question: string; answer: string; options: ShownOption[] }

// Matches the server's limit on earlier turns sent with a follow-up.
const HISTORY_SENT = 6

type AskAiPanelProps = {
  turns: ChatTurn[]
  onTurnsChange: (turns: ChatTurn[]) => void
  onClose: () => void
  onViewOptions: () => void
}

export function AskAiPanel({ turns, onTurnsChange, onClose, onViewOptions }: AskAiPanelProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const { facts, options, optionLabels, omittedFacts, omittedOptions } = buildAssistantContext(workspace, rehearsal, format, words)
  const bulk = rehearsal.plans.find((plan) => plan.kind === 'bulk-transfer')
  const priorityOrder = workspace.orders.find((order) => order.priority === 'protected' && rehearsal.impact.affectedOrderIds.includes(order.id))
  const suggestions = [
    bulk?.quantity ? `Why can't I move all ${words.quantity(bulk.quantity, bulk.productId)} at once?` : 'What is the best option right now?',
    priorityOrder ? `How can I protect ${priorityOrder.customer}’s order?` : 'Which orders are at risk?',
  ]
  useEscapeKey(onClose)
  const [prompt, setPrompt] = useState('')
  const [serviceState, setServiceState] = useState<ServiceState>('checking')
  const [sending, setSending] = useState(false)
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const threadEnd = useRef<HTMLDivElement>(null)
  useEffect(() => { threadEnd.current?.scrollIntoView({ block: 'end' }) }, [turns.length, pendingQuestion])

  useEffect(() => {
    let cancelled = false
    fetch('/api/health')
      .then(async (response) => {
        if (!response.ok) throw new Error('AI service unavailable')
        return response.json() as Promise<{ aiConfigured?: boolean }>
      })
      .then((health) => {
        if (!cancelled) setServiceState(health.aiConfigured ? 'ready' : 'missing-key')
      })
      .catch(() => {
        if (!cancelled) setServiceState('offline')
      })
    return () => { cancelled = true }
  }, [])

  const submitPrompt = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const question = prompt.trim()
    if (!question || serviceState !== 'ready' || sending) return

    setSending(true)
    setPendingQuestion(question)
    setRequestError(null)
    try {
      const history = turns.slice(-HISTORY_SENT).map((turn) => ({ question: turn.question, answer: turn.answer }))
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceName: workspace.businessName, question, history, facts, options }),
      })
      const result = await response.json() as AssistantReply | { error?: { code?: string; message?: string } }
      if (!response.ok) {
        const error = 'error' in result ? result.error : undefined
        if (error?.code === 'AI_NOT_CONFIGURED') setServiceState('missing-key')
        throw new Error(error?.message ?? 'Gemini could not answer. Please try again.')
      }
      const reply = result as AssistantReply
      const shown = reply.referencedOptionIds
        .map((id) => options.find((option) => option.id === id))
        .filter((option) => option !== undefined)
        .map((option) => ({
          id: option.id, title: option.title, status: option.status, outcome: option.outcome, cost: option.cost,
          label: optionLabels[option.id] ?? option.status,
          recommended: reply.recommendedOptionId === option.id && option.status === 'ready',
        }))
      onTurnsChange([...turns, { question, answer: reply.answer, options: shown }])
      setPrompt('')
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Gemini could not answer. Please try again.')
    } finally {
      setSending(false)
      setPendingQuestion(null)
    }
  }

  const serviceMessage = {
    checking: 'Checking Gemini connection…',
    ready: 'Your question and current facts are sent to Google Gemini for this answer.',
    'missing-key': 'Gemini key is not configured. Add GEMINI_API_KEY to backend/.env.',
    offline: 'The Rehearsal API is not reachable. Start the backend on port 8080.',
  }[serviceState]

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
          <div className={`assistant-status assistant-status--${serviceState}`}>
            {serviceState === 'ready' ? <CheckCircle2 size={16} /> : <CircleAlert size={16} />}
            <span>{serviceMessage} <strong>The conversation stays until you reload the page; Rehearsal does not save it.</strong></span>
          </div>
          {(omittedFacts > 0 || omittedOptions > 0) && <p className="not-sent-notice">To keep the request small, Gemini will not see {omittedFacts > 0 ? `${omittedFacts} facts` : ''}{omittedFacts > 0 && omittedOptions > 0 ? ' and ' : ''}{omittedOptions > 0 ? `${omittedOptions} options` : ''}. Its answer may miss them.</p>}
          {turns.length === 0 && <div className="assistant-intro">
            <Sparkles size={17} />
            <div><strong>Ask about your orders and stock</strong><p>Gemini explains the facts and points to options the planner has checked. Ask follow-up questions; it remembers this conversation.</p></div>
          </div>}
          {turns.length > 0 && <div className="assistant-thread-head">
            <span>{turns.length} {turns.length === 1 ? 'question' : 'questions'} in this conversation</span>
            <Button icon={<RotateCcw size={13} />} onClick={() => { onTurnsChange([]); setRequestError(null) }} variant="quiet">New conversation</Button>
          </div>}
          <div aria-live="polite" className="assistant-thread">
            {turns.map((turn, index) => (
              <div className="assistant-turn" key={index}>
                <p className="assistant-question">{turn.question}</p>
                <div className="assistant-reply">
                  <p>{turn.answer}</p>
                  {turn.options.length > 0 && <div className="assistant-option-links"><span>CHECKED OPTIONS</span>{turn.options.map((option) => (
                    <button className="assistant-option-link" key={option.id} onClick={onViewOptions} type="button">
                      <StatusBadge tone={option.status === 'ready' ? 'success' : option.status === 'conditional' ? 'warning' : 'danger'} dot>{option.label}</StatusBadge>
                      <strong>{option.title}</strong><small>{option.outcome}</small><small>{option.cost}</small>
                      {option.recommended && <span className="assistant-recommended">Suggested by Gemini · checked by planner</span>}
                    </button>
                  ))}</div>}
                </div>
              </div>
            ))}
            {pendingQuestion && <div className="assistant-turn">
              <p className="assistant-question">{pendingQuestion}</p>
              <p className="assistant-thinking"><LoaderCircle className="spin-icon" size={14} /> Thinking…</p>
            </div>}
            <div ref={threadEnd} />
          </div>
          {turns.length === 0 && !pendingQuestion && <>
            <p className="suggestion-label">TRY ASKING</p>
            <div className="suggestion-list">
              {suggestions.map((suggestion) => (
                <button className="suggestion-chip" key={suggestion} onClick={() => { setPrompt(suggestion); setRequestError(null) }} type="button">{suggestion}</button>
              ))}
            </div>
          </>}
          {requestError && <p aria-live="polite" className="not-sent-notice">{requestError}</p>}
        </div>
        <form className="assistant-composer" onSubmit={submitPrompt}>
          <label className="visually-hidden" htmlFor="assistant-prompt">Ask a question about this disruption</label>
          <textarea id="assistant-prompt" maxLength={1200} onChange={(event) => { setPrompt(event.target.value); setRequestError(null) }} placeholder={turns.length ? 'Ask a follow-up…' : 'Ask about orders, timing, or another plan...'} value={prompt} />
          <div className="composer-footer"><span>Your question, this conversation, the facts and checked options are sent; no records are changed.</span><Button aria-label="Send question" disabled={!prompt.trim() || sending || serviceState !== 'ready'} icon={sending ? <LoaderCircle className="spin-icon" size={15} /> : <Send size={15} />} type="submit" variant="primary">{sending ? 'Thinking' : 'Send'}</Button></div>
        </form>
      </aside>
    </div>
  )
}
