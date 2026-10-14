import { useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, FileUp, LoaderCircle, PencilLine, ShieldCheck, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { Workspace } from '../../../../shared/planner/model'
import { orderCoverage, rehearse, spareStock } from '../../../../shared/planner/plan'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { createWording } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { choicesOf, displayValue, parseField, type EditorConfig, type ParsedValue } from './editorConfigs'
import { MultiPicker } from './MultiPicker'
import { originAfterTyping, resolveEvidence, reviewFieldKeys, type Origin } from './editorRules'

type ExtractedField = { key: string; value: string | null; quote: string | null }

const MAX_FILE_BYTES = 4 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

type DetailsEditorProps = {
  config: EditorConfig
  initialMode: 'manual' | 'document'
  onApply: (next: Workspace) => void
  onClose: () => void
}

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(new Error('Could not read the file.'))
    reader.readAsDataURL(file)
  })
}

export function DetailsEditor({ config, initialMode, onApply, onClose }: DetailsEditorProps) {
  const { workspace, rehearsal: before, format, words } = useWorkspaceView()
  const canReadDocuments = config.fields.some((field) => field.extractable)
  const [mode, setMode] = useState(canReadDocuments ? initialMode : 'manual')
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [values, setValues] = useState(config.initial)
  const [origin, setOrigin] = useState<Record<string, Origin>>(() => Object.fromEntries(config.fields.map((field) => [field.key, 'unchanged'])))
  const [quotes, setQuotes] = useState<Record<string, string>>({})
  const [documentName, setDocumentName] = useState<string | null>(null)
  const [documentSummary, setDocumentSummary] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [recordedAt, setRecordedAt] = useState(() => new Date().toISOString())
  useEscapeKey(onClose)

  const parsed = useMemo(() => Object.fromEntries(config.fields.map((field) => [field.key, parseField(field, values[field.key] ?? '', format)])), [config.fields, values, format])
  const fieldErrors = Object.values(parsed).some((result) => 'error' in result)
  const crossError = useMemo(() => {
    if (fieldErrors || !config.validate) return null
    return config.validate(Object.fromEntries(Object.entries(parsed).map(([key, result]) => [key, 'value' in result ? result.value : null])))
  }, [fieldErrors, config, parsed])
  const hasErrors = fieldErrors || crossError !== null

  const evidenceFor = (key: string, value: ParsedValue) => resolveEvidence(origin[key], value, config.initialEvidence[key], documentName, recordedAt)

  const isNew = config.isNew ?? false
  const changedKeys = reviewFieldKeys(isNew, config.fields, values, config.initial, origin, config.initialEvidence)
  const changedFields = config.fields.filter((field) => changedKeys.includes(field.key))

  // The change as typed so far, so a shortage can be flagged before Review.
  const draft = useMemo(() => {
    if (hasErrors) return null
    const parsedValues = Object.fromEntries(Object.entries(parsed).map(([key, result]) => [key, 'value' in result ? result.value : null]))
    const evidence = Object.fromEntries(Object.entries(parsedValues).map(([key, value]) => [key, resolveEvidence(origin[key], value, config.initialEvidence[key], documentName, recordedAt)]))
    return config.apply(parsedValues, evidence)
  }, [hasErrors, parsed, origin, config, documentName, recordedAt])
  const next = step === 'review' ? draft : null

  const after = useMemo(() => (next ? rehearse(next) : null), [next])
  const nextWords = useMemo(() => (next ? createWording(next, format) : null), [next, format])
  const draftWords = useMemo(() => (draft ? createWording(draft, format) : null), [draft, format])
  // Order lines this change leaves short that weren't short before (e.g. a new order for an empty warehouse).
  const newShortages = useMemo(() => {
    if (!draft) return []
    const before = new Map(orderCoverage(workspace).map((line) => [`${line.orderId}|${line.productId}`, line]))
    return orderCoverage(draft).filter((line) => {
      const earlier = before.get(`${line.orderId}|${line.productId}`)
      return line.status === 'short' && (!earlier || earlier.status !== 'short' || earlier.covered > line.covered)
    })
  }, [draft, workspace])
  // The order this form is about: the one being edited, or the one being added.
  const targetOrderId = useMemo(() => {
    const edited = config.stockChecks?.find((check) => check.orderId)?.orderId
    if (edited) return edited
    if (!config.stockChecks || !draft) return null
    return draft.orders.find((order) => !workspace.orders.some((item) => item.id === order.id))?.id ?? null
  }, [config.stockChecks, draft, workspace])
  // Shown under each quantity: how much the chosen warehouse can spare, and whether this order needs more.
  const stockHints = useMemo(() => {
    const hints: Record<string, { productId: string; locationId: string; onHand: number; counted: boolean; spare: number; short: boolean; coveredByDeliveries: boolean }> = {}
    const value = (key: string) => { const result = parsed[key]; return result && 'value' in result ? result.value : null }
    for (const check of config.stockChecks ?? []) {
      const productId = check.productId ?? (check.productKey ? value(check.productKey) : null)
      const locationId = value(check.locationKey)
      const quantity = value(check.quantityKey)
      if (typeof productId !== 'string' || typeof locationId !== 'string') continue
      // An edited order's own demand must not count against itself.
      const others = check.orderId ? { ...workspace, orders: workspace.orders.filter((order) => order.id !== check.orderId) } : workspace
      const record = workspace.stock.find((item) => item.locationId === locationId && item.productId === productId)
      const spare = spareStock(others, locationId, productId)
      const wanted = typeof quantity === 'number' ? quantity : null
      // With every field filled, the full check also counts deliveries arriving before the due date.
      const line = draft && targetOrderId ? orderCoverage(draft, locationId).find((item) => item.orderId === targetOrderId && item.productId === productId) : undefined
      const short = line ? line.status === 'short' : wanted !== null && wanted > spare
      const coveredByDeliveries = Boolean(line) && !short && wanted !== null && wanted > spare
      hints[check.quantityKey] = { productId, locationId, onHand: record?.available.value ?? 0, counted: Boolean(record), spare, short, coveredByDeliveries }
    }
    return hints
  }, [config.stockChecks, parsed, workspace, draft, targetOrderId])
  // Other orders this change leaves short; the order in the form is covered by the hint under its quantity.
  const otherShortages = newShortages.filter((line) => line.orderId !== targetOrderId)

  const updateValue = (key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }))
    setOrigin((previous) => ({ ...previous, [key]: originAfterTyping(value, config.initial[key]) }))
  }

  const readDocument = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReadError(null)
    if (!ACCEPTED_TYPES.includes(file.type)) { setReadError('Use a PNG, JPG, WEBP photo or a PDF.'); return }
    if (file.size > MAX_FILE_BYTES) { setReadError('That file is over 4 MB. Try a smaller photo or a single-page PDF.'); return }

    setReading(true)
    try {
      const response = await fetch('/api/documents/extract', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name.slice(0, 120),
          mimeType: file.type,
          dataBase64: await readAsBase64(file),
          timeZone: workspace.settings.timeZone,
          fields: config.fields.filter((field) => field.extractable).map(({ key, label, type }) => ({ key, label, type })),
        }),
      })
      const result = await response.json() as { fields?: ExtractedField[]; summary?: string; error?: { message?: string } }
      if (!response.ok || !result.fields) throw new Error(result.error?.message ?? 'The document could not be read. You can still type the details in.')

      const found = result.fields.filter((field) => field.value !== null)
      const fieldTypes = Object.fromEntries(config.fields.map((field) => [field.key, field.type]))
      setValues((previous) => ({
        ...previous,
        ...Object.fromEntries(found.map((field) => [field.key, fieldTypes[field.key] === 'datetime' ? format.toInput(field.value as string) : field.value as string])),
      }))
      setOrigin((previous) => ({ ...previous, ...Object.fromEntries(found.map((field) => [field.key, 'document' as const])) }))
      setQuotes(Object.fromEntries(found.map((field) => [field.key, field.quote ?? ''])))
      setDocumentName(file.name.slice(0, 120))
      setDocumentSummary(result.summary ?? null)
      if (found.length === 0) setReadError('Nothing matching these details was found in that document.')
    } catch (error) {
      setReadError(error instanceof Error ? error.message : 'The document could not be read.')
    } finally {
      setReading(false)
    }
  }

  const goToReview = () => {
    setShowErrors(true)
    if (hasErrors) return
    setRecordedAt(new Date().toISOString())
    setStep('review')
  }

  const extractableCount = config.fields.filter((field) => field.extractable).length
  const foundCount = Object.values(origin).filter((item) => item === 'document').length
  const showForm = mode === 'manual' || documentName !== null
  const planChanges = after && nextWords ? after.plans
    .map((plan) => {
      const previous = before.plans.find((item) => item.id === plan.id)
      return { now: nextWords.planText(plan), previous: previous ? words.planText(previous) : null, id: plan.id }
    })
    .filter(({ now, previous }) => !previous || previous.statusLabel !== now.statusLabel || previous.impact !== now.impact) : []
  const exposedBefore = before.impact.exposedQuantity
  const exposedAfter = after?.impact.exposedQuantity
  const atRiskBefore = before.impact.affectedOrderIds.length
  const atRiskAfter = after?.impact.affectedOrderIds.length

  return (
    <div className="assistant-overlay">
      <button aria-label="Close editor" className="assistant-scrim" onClick={onClose} type="button" />
      <aside aria-labelledby="editor-title" aria-modal="true" className="assistant-panel editor-panel" role="dialog">
        <header className="assistant-header">
          <span className="assistant-icon">{step === 'review' ? <ShieldCheck size={19} /> : <PencilLine size={19} />}</span>
          <div><h2 id="editor-title">{config.title}</h2><p>{step === 'review' ? 'Step 2 of 2 · Check the effect before saving' : `Step 1 of 2 · ${config.subtitle}`}</p></div>
          <Button aria-label="Close editor" className="assistant-close" icon={<X size={18} />} onClick={onClose} title="Close" variant="quiet" />
        </header>

        {step === 'edit' && <div className="assistant-body editor-body">
          {canReadDocuments && <div aria-label="How do you want to add details?" className="editor-mode" role="radiogroup">
            <button aria-checked={mode === 'manual'} className={mode === 'manual' ? 'is-active' : ''} onClick={() => setMode('manual')} role="radio" type="button"><PencilLine size={15} /><span><strong>Type it in</strong><small>Quick, marked unverified</small></span></button>
            <button aria-checked={mode === 'document'} className={mode === 'document' ? 'is-active' : ''} onClick={() => setMode('document')} role="radio" type="button"><FileUp size={15} /><span><strong>Attach proof</strong><small>Photo or PDF, marked verified</small></span></button>
          </div>}

          {mode === 'document' && <div className="editor-upload">
            <p>{config.documentHint}. Gemini reads it and fills in what it finds — you check every value before anything is saved.</p>
            <label className={`ds-button ds-button--secondary editor-file-button ${reading ? 'is-busy' : ''}`}>
              {reading ? <LoaderCircle className="spin-icon" size={15} /> : <FileUp size={15} />}
              {reading ? 'Reading document…' : documentName ? 'Use a different file' : 'Choose photo or PDF'}
              <input accept={ACCEPTED_TYPES.join(',')} className="visually-hidden" disabled={reading} onChange={readDocument} type="file" />
            </label>
            <small>The file is sent to Google Gemini to read it. Rehearsal does not store the file.</small>
            {documentName && <p className="editor-found"><ShieldCheck size={14} /> <span><strong>{documentName}</strong> · found {foundCount} of {extractableCount} details{documentSummary ? ` · ${documentSummary}` : ''}</span></p>}
          </div>}
          {readError && <p aria-live="polite" className="not-sent-notice">{readError}</p>}

          {showForm && <div className="editor-fields">
            {config.fields.map((field) => {
              const result = parsed[field.key]
              const fieldOrigin = origin[field.key]
              const inputId = `field-${field.key}`
              return (
                <div className={`editor-field ${fieldOrigin === 'document' ? 'from-document' : ''}`} key={field.key}>
                  <label htmlFor={inputId}>{field.label}{!field.required && <small> · optional</small>}</label>
                  {field.hint && <small className="editor-hint" id={`${inputId}-hint`}>{field.hint}</small>}
                  {field.type === 'multiselect'
                    ? <MultiPicker chosen={choicesOf(values[field.key])} describedBy={field.hint ? `${inputId}-hint` : undefined} id={inputId} label={field.label} onChange={(chosen) => updateValue(field.key, JSON.stringify(chosen))} options={field.options ?? []} />
                    : field.type === 'select'
                    ? <select id={inputId} onChange={(event) => updateValue(field.key, event.target.value)} value={values[field.key]}>{field.options?.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
                    : <span className="editor-input-wrap"><input aria-describedby={field.hint ? `${inputId}-hint` : undefined} id={inputId} inputMode={field.type === 'integer' ? 'numeric' : field.type === 'money' ? 'decimal' : undefined} onChange={(event) => updateValue(field.key, event.target.value)} placeholder={field.placeholder ?? (field.required ? '' : 'Unknown')} type={field.type === 'datetime' ? 'datetime-local' : 'text'} value={values[field.key]} />{field.suffix && <span className="editor-suffix">{field.suffix}</span>}</span>}
                  <div className="editor-field-meta">
                    {field.isFact && (values[field.key] ?? '').trim() !== '' && <EvidenceMark evidence={evidenceFor(field.key, values[field.key])} />}
                    {fieldOrigin === 'document' && quotes[field.key] && <small className="editor-quote">“{quotes[field.key]}”</small>}
                    {mode === 'document' && documentName && field.extractable && fieldOrigin !== 'document' && <small className="editor-missing">Not found in the document</small>}
                  </div>
                  {(showErrors || (values[field.key] ?? '').trim() !== '') && 'error' in result && <small className="editor-error">{result.error}</small>}
                  {stockHints[field.key] && (!('error' in result) || !(values[field.key] ?? '').trim()) && (() => {
                    const hint = stockHints[field.key]
                    const where = words.locationName(hint.locationId)
                    const promised = hint.onHand > hint.spare ? ` (it has ${format.number(hint.onHand)}; the rest is promised to other orders)` : ''
                    return <small aria-live="polite" className={hint.short ? 'editor-stock-warning' : 'editor-hint'}>
                      {hint.short
                        ? `More than ${where} can spare: at most ${words.quantity(hint.spare, hint.productId)}${promised}${hint.counted ? '' : ` (no stock count for ${words.productName(hint.productId)} there, so it counts as 0)`}. You can still save the order; Rehearsal will look for ways to cover it.`
                        : hint.coveredByDeliveries
                          ? `Covered: ${where} can spare ${words.quantity(hint.spare, hint.productId)} now, and deliveries arrive before the due date.`
                          : hint.counted
                            ? `${where} can spare up to ${words.quantity(hint.spare, hint.productId)}${promised}.`
                            : `${where} has no stock count for ${words.productName(hint.productId)}, so it counts as 0.`}
                    </small>
                  })()}
                </div>
              )
            })}
          </div>}
          {showErrors && crossError && <p className="editor-error" role="alert">{crossError}</p>}
          {showForm && draftWords && otherShortages.length > 0 && <div aria-live="polite" className="editor-live-warning">
            <strong>{config.stockChecks ? 'This leaves other orders short' : 'Not enough stock'}</strong>
            <ul className="editor-shortages">{otherShortages.map((line) => (
              <li key={`${line.orderId}-${line.productId}`}><strong>{draftWords.customer(line.orderId)} · {draftWords.productName(line.productId)}</strong><small>{draftWords.shortageText(line)}</small></li>
            ))}</ul>
            <small>You can still save it; Rehearsal will then show ways to cover it.</small>
          </div>}
        </div>}

        {step === 'review' && <div className="assistant-body editor-body">
          <p className="editor-review-intro">{isNew ? 'This adds a new record. Nothing is saved until you confirm.' : 'Is this right? Nothing is saved until you confirm.'}</p>
          {changedFields.length === 0
            ? <p className="editor-empty">No changes to save.</p>
            : <ul className="editor-changes">
              {changedFields.map((field) => (
                <li key={field.key}>
                  <span>{field.label}</span>
                  {isNew
                    ? <span className="editor-change-values"><strong>{displayValue(field, values[field.key] ?? '', format)}</strong></span>
                    : <span className="editor-change-values"><s>{displayValue(field, config.initial[field.key] ?? '', format)}</s><ArrowRight size={13} /><strong>{displayValue(field, values[field.key] ?? '', format)}</strong></span>}
                  {field.isFact && (values[field.key] ?? '').trim() !== '' && <EvidenceMark evidence={evidenceFor(field.key, 'value' in parsed[field.key] ? (parsed[field.key] as { value: ParsedValue }).value : null)} />}
                </li>
              ))}
            </ul>}
          {after && <div className="editor-impact">
            <p className="reply-label">WHAT THIS CHANGES</p>
            {nextWords && newShortages.length > 0 && <ul className="editor-shortages">{newShortages.map((line) => (
              <li key={`${line.orderId}-${line.productId}`}><strong>{nextWords.customer(line.orderId)} · {nextWords.productName(line.productId)}</strong><small>{nextWords.shortageText(line)}</small></li>
            ))}</ul>}
            {before.impact.groups.length === 0 && after.impact.groups.length === 0
              ? newShortages.length === 0 && <small>Nothing is late right now, and every order is still covered.</small>
              : exposedBefore === exposedAfter && atRiskBefore === atRiskAfter
              ? <small>The shortage stays at {words.totalQuantity(exposedBefore)} across {atRiskBefore} orders until you approve a plan.</small>
              : <div className="editor-impact-stats">
                <span>Exposed <strong>{words.totalQuantity(exposedBefore)} → {words.totalQuantity(exposedAfter ?? 0)}</strong></span>
                <span>Orders at risk <strong>{atRiskBefore} → {atRiskAfter}</strong></span>
              </div>}
            {before.impact.groups.length === 0 && after.impact.groups.length === 0 ? null : planChanges.length === 0
              ? <small>No recovery option changes.</small>
              : <ul>{planChanges.map(({ now, previous, id }) => (
                <li key={id}><strong>{now.title}</strong><span>{previous ? `${previous.statusLabel} → ` : 'New option · '}{now.statusLabel}</span><small>{now.impact}</small></li>
              ))}</ul>}
          </div>}
        </div>}

        <footer className="editor-footer">
          {step === 'edit'
            ? <><Button onClick={onClose} variant="quiet">Cancel</Button><Button disabled={!showForm || reading} icon={<ArrowRight size={15} />} onClick={goToReview} variant="primary">Review changes</Button></>
            : <><Button icon={<ArrowLeft size={15} />} onClick={() => setStep('edit')} variant="quiet">Back</Button><Button disabled={!next || changedFields.length === 0} onClick={() => next && onApply(next)} variant="primary">Confirm and save</Button></>}
        </footer>
      </aside>
    </div>
  )
}
