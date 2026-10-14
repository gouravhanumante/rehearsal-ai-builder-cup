import { useEffect, useState, type FormEvent } from 'react'
import { Bot, CheckCircle2, CircleAlert, LoaderCircle, Send, Sparkles, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import type { DistributorData, Evidence } from '../../data/distributorDemo'
import type { Rehearsal } from '../../domain/rehearseDistributor'
import { formatDateTime } from '../../lib/istTime'

type ServiceState = 'checking' | 'ready' | 'missing-key' | 'offline'

type AssistantReply = {
  answer: string
  referencedOptionIds: string[]
  recommendedOptionId: string | null
}

type AskAiPanelProps = {
  data: DistributorData
  rehearsal: Rehearsal
  onClose: () => void
  onViewOptions: () => void
}

const suggestions = [
  "Why can't I transfer all 14 cases today?",
  'How can I protect Common Ground Cafe’s order?',
]

const evidenceStatus = (evidence: Evidence | null) => !evidence ? 'unknown' : evidence.kind === 'manual' ? 'unverified' : 'confirmed'
const sourceOf = (evidence: Evidence | null) => !evidence ? 'Not known yet' : evidence.kind === 'manual' ? 'Typed in by the user, no document' : evidence.kind === 'document' ? `Document: ${evidence.source}` : 'Sample data'

function buildContext(data: DistributorData, rehearsal: Rehearsal) {
  const { inventory, warehouses, shipment, product } = data
  const facts = [
    { id: 'shipment', label: 'Confirmed inbound shipment', value: `${shipment.cases} cases from ${shipment.supplier}; expected ${formatDateTime(shipment.confirmedArrivalAt)}`, evidenceStatus: 'confirmed', source: shipment.updateSource },
    { id: 'north-stock', label: `${warehouses.north.name} stock`, value: `${inventory.northCases.value} cases of ${product.name}`, evidenceStatus: evidenceStatus(inventory.northCases.evidence), source: sourceOf(inventory.northCases.evidence) },
    { id: 'south-stock', label: `${warehouses.south.name} stock`, value: `${inventory.southUnallocatedCases.value} unallocated cases`, evidenceStatus: evidenceStatus(inventory.southUnallocatedCases.evidence), source: sourceOf(inventory.southUnallocatedCases.evidence) },
    ...data.orders.map((order) => ({
      id: order.id,
      label: `${order.customer} order`.slice(0, 100),
      value: `${order.cases} cases due ${formatDateTime(order.dueAt)}; ${order.priority} priority`,
      evidenceStatus: evidenceStatus(order.evidence),
      source: sourceOf(order.evidence),
    })),
    ...data.suppliers.flatMap((supplier) => [
      { id: `${supplier.id}-stock`, label: `${supplier.name} stock available`, value: supplier.availableCases.value === null ? null : `${supplier.availableCases.value} cases`, evidence: supplier.availableCases.evidence },
      { id: `${supplier.id}-price`, label: `${supplier.name} price per case`, value: supplier.pricePerCase.value === null ? null : `$${supplier.pricePerCase.value}`, evidence: supplier.pricePerCase.evidence },
      { id: `${supplier.id}-arrival`, label: `${supplier.name} arrival`, value: supplier.arrivalAt.value === null ? null : formatDateTime(supplier.arrivalAt.value), evidence: supplier.arrivalAt.evidence },
    ].map(({ evidence, ...fact }) => ({ ...fact, label: fact.label.slice(0, 100), evidenceStatus: evidenceStatus(evidence), source: sourceOf(evidence) }))),
  ].slice(0, 40)

  const options = rehearsal.plans.slice(0, 8).map((plan) => ({
    id: plan.id,
    title: plan.title.slice(0, 140),
    status: plan.status,
    reason: `${plan.detail}${plan.unverifiedFacts.length ? ` Relies on typed-in, unverified details: ${plan.unverifiedFacts.map((fact) => fact.label).join(', ')}.` : ''}`.slice(0, 500),
    outcome: plan.impact,
    cost: plan.cost,
  }))
  return { facts, options }
}

export function AskAiPanel({ data, rehearsal, onClose, onViewOptions }: AskAiPanelProps) {
  const { facts, options } = buildContext(data, rehearsal)
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
        body: JSON.stringify({ workspaceName: data.businessName, question, facts, options }),
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
