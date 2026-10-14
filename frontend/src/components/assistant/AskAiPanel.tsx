import { useEffect, useState, type FormEvent } from 'react'
import { Bot, CheckCircle2, CircleAlert, LoaderCircle, Send, Sparkles, X } from 'lucide-react'
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

type AskAiPanelProps = {
  onClose: () => void
  onViewOptions: () => void
}

export function AskAiPanel({ onClose, onViewOptions }: AskAiPanelProps) {
  const { workspace, rehearsal, format, words } = useWorkspaceView()
  const { facts, options, omittedFacts, omittedOptions } = buildAssistantContext(workspace, rehearsal, format, words)
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
  const [reply, setReply] = useState<AssistantReply | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)

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
    setReply(null)
    setRequestError(null)
    try {
      const response = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ workspaceName: workspace.businessName, question, facts, options }),
      })
      const result = await response.json() as AssistantReply | { error?: { code?: string; message?: string } }
      if (!response.ok) {
        const error = 'error' in result ? result.error : undefined
        if (error?.code === 'AI_NOT_CONFIGURED') setServiceState('missing-key')
        throw new Error(error?.message ?? 'Gemini could not answer. Please try again.')
      }
      setReply(result as AssistantReply)
      setPrompt('')
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Gemini could not answer. Please try again.')
    } finally {
      setSending(false)
    }
  }

  const referencedOptions = reply?.referencedOptionIds
    .map((id) => options.find((option) => option.id === id))
    .filter((option) => option !== undefined) ?? []
  const recommendedOption = reply?.recommendedOptionId
    ? options.find((option) => option.id === reply.recommendedOptionId && option.status === 'ready')
    : undefined

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
            <span>{serviceMessage} <strong>Rehearsal does not save this conversation.</strong></span>
          </div>
          {(omittedFacts > 0 || omittedOptions > 0) && <p className="not-sent-notice">To keep the request small, Gemini will not see {omittedFacts > 0 ? `${omittedFacts} facts` : ''}{omittedFacts > 0 && omittedOptions > 0 ? ' and ' : ''}{omittedOptions > 0 ? `${omittedOptions} options` : ''}. Its answer may miss them.</p>}
          <div className="assistant-intro">
            <Sparkles size={17} />
            <div><strong>Ask about this delay</strong><p>Gemini can explain confirmed facts or point to a checked option. Any idea without a planner result stays unverified.</p></div>
          </div>
          {reply && <div aria-live="polite" className="assistant-reply">
            <p className="reply-label">ANSWER</p>
            <p>{reply.answer}</p>
            {referencedOptions.length > 0 && <div className="assistant-option-links"><span>CHECKED OPTIONS</span>{referencedOptions.map((option) => (
              <button className="assistant-option-link" key={option.id} onClick={onViewOptions} type="button">
                <StatusBadge tone={option.status === 'ready' ? 'success' : option.status === 'conditional' ? 'warning' : 'danger'} dot>{option.status === 'ready' ? 'Ready to use' : option.status === 'conditional' ? 'Needs information' : "Can't be done"}</StatusBadge>
                <strong>{option.title}</strong><small>{option.outcome}</small><small>{option.cost}</small>
                {recommendedOption?.id === option.id && <span className="assistant-recommended">Suggested by Gemini · checked by planner</span>}
              </button>
            ))}</div>}
          </div>}
          <p className="suggestion-label">TRY ASKING</p>
          <div className="suggestion-list">
            {suggestions.map((suggestion) => (
              <button className="suggestion-chip" key={suggestion} onClick={() => { setPrompt(suggestion); setReply(null); setRequestError(null) }} type="button">{suggestion}</button>
            ))}
          </div>
          {requestError && <p aria-live="polite" className="not-sent-notice">{requestError}</p>}
        </div>
        <form className="assistant-composer" onSubmit={submitPrompt}>
          <label className="visually-hidden" htmlFor="assistant-prompt">Ask a question about this disruption</label>
          <textarea id="assistant-prompt" maxLength={1200} onChange={(event) => { setPrompt(event.target.value); setRequestError(null) }} placeholder="Ask about orders, timing, or another plan..." value={prompt} />
          <div className="composer-footer"><span>Only the current question, facts, and checked options are sent; no records are changed.</span><Button aria-label="Send question" disabled={!prompt.trim() || sending || serviceState !== 'ready'} icon={sending ? <LoaderCircle className="spin-icon" size={15} /> : <Send size={15} />} type="submit" variant="primary">{sending ? 'Thinking' : 'Send'}</Button></div>
        </form>
      </aside>
    </div>
  )
}
