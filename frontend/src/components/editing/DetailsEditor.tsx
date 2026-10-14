import { useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, FileUp, LoaderCircle, PencilLine, ShieldCheck, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { DistributorData, Evidence } from '../../data/distributorDemo'
import { rehearseDistributor } from '../../domain/rehearseDistributor'
import { toIstInput } from '../../lib/istTime'
import { EvidenceMark } from '../evidence/EvidenceMark'
import { displayValue, parseField, type EditorConfig, type ParsedValue } from './editorConfigs'

type Origin = 'unchanged' | 'typed' | 'document'
type ExtractedField = { key: string; value: string | null; quote: string | null }

const MAX_FILE_BYTES = 4 * 1024 * 1024
const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf']

type DetailsEditorProps = {
  config: EditorConfig
  current: DistributorData
  initialMode: 'manual' | 'document'
  onApply: (next: DistributorData) => void
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

/** Where a saved value came from: the attached document, the keyboard, or whatever it had before. */
function resolveEvidence(origin: Origin, value: ParsedValue, previous: Evidence | null, documentName: string | null, recordedAt: string): Evidence | null {
  if (value === null) return null
  if (origin === 'document' && documentName) return { kind: 'document', source: documentName, recordedAt }
  if (origin === 'typed' || !previous) return { kind: 'manual', source: 'Entered manually', recordedAt }
  return previous
}

export function DetailsEditor({ config, current, initialMode, onApply, onClose }: DetailsEditorProps) {
  const [mode, setMode] = useState(initialMode)
  const [step, setStep] = useState<'edit' | 'review'>('edit')
  const [values, setValues] = useState(config.initial)
  const [origin, setOrigin] = useState<Record<string, Origin>>(() => Object.fromEntries(config.fields.map((field) => [field.key, 'unchanged'])))
  const [quotes, setQuotes] = useState<Record<string, string>>({})
  const [documentName, setDocumentName] = useState<string | null>(null)
  const [documentSummary, setDocumentSummary] = useState<string | null>(null)
  const [reading, setReading] = useState(false)
  const [readError, setReadError] = useState<string | null>(null)
  const [showErrors, setShowErrors] = useState(false)
  const [recordedAt] = useState(() => new Date().toISOString())

  const parsed = useMemo(() => Object.fromEntries(config.fields.map((field) => [field.key, parseField(field, values[field.key] ?? '')])), [config.fields, values])
  const hasErrors = Object.values(parsed).some((result) => 'error' in result)

  const evidenceFor = (key: string, value: ParsedValue) => resolveEvidence(origin[key], value, config.initialEvidence[key], documentName, recordedAt)

  const changedFields = config.fields.filter((field) => origin[field.key] !== 'unchanged' && values[field.key] !== config.initial[field.key]
    || origin[field.key] === 'document' && config.initialEvidence[field.key]?.kind !== 'document')

  const next = useMemo(() => {
    if (step !== 'review' || hasErrors) return null
    const parsedValues = Object.fromEntries(Object.entries(parsed).map(([key, result]) => [key, 'value' in result ? result.value : null]))
    const evidence = Object.fromEntries(Object.entries(parsedValues).map(([key, value]) => [key, resolveEvidence(origin[key], value, config.initialEvidence[key], documentName, recordedAt)]))
    return config.apply(parsedValues, evidence)
  }, [step, hasErrors, parsed, origin, config, documentName, recordedAt])

  const before = useMemo(() => rehearseDistributor(current), [current])
  const after = useMemo(() => (next ? rehearseDistributor(next) : null), [next])

  const updateValue = (key: string, value: string) => {
    setValues((previous) => ({ ...previous, [key]: value }))
    setOrigin((previous) => ({ ...previous, [key]: value === config.initial[key] ? 'unchanged' : 'typed' }))
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
          fields: config.fields.filter((field) => field.extractable).map(({ key, label, type }) => ({ key, label, type })),
        }),
      })
      const result = await response.json() as { fields?: ExtractedField[]; summary?: string; error?: { message?: string } }
      if (!response.ok || !result.fields) throw new Error(result.error?.message ?? 'The document could not be read. You can still type the details in.')

      const found = result.fields.filter((field) => field.value !== null)
      const fieldTypes = Object.fromEntries(config.fields.map((field) => [field.key, field.type]))
      setValues((previous) => ({
        ...previous,
        ...Object.fromEntries(found.map((field) => [field.key, fieldTypes[field.key] === 'datetime' ? toIstInput(field.value as string) : field.value as string])),
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
    if (!hasErrors) setStep('review')
  }

  const extractableCount = config.fields.filter((field) => field.extractable).length
  const foundCount = Object.values(origin).filter((item) => item === 'document').length
  const showForm = mode === 'manual' || documentName !== null
  const planChanges = after ? after.plans
    .map((plan) => ({ plan, previous: before.plans.find((item) => item.id === plan.id) }))
    .filter(({ plan, previous }) => !previous || previous.statusLabel !== plan.statusLabel || previous.impact !== plan.impact) : []

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
          <div aria-label="How do you want to add details?" className="editor-mode" role="radiogroup">
            <button aria-checked={mode === 'manual'} className={mode === 'manual' ? 'is-active' : ''} onClick={() => setMode('manual')} role="radio" type="button"><PencilLine size={15} /><span><strong>Type it in</strong><small>Quick, marked unverified</small></span></button>
            <button aria-checked={mode === 'document'} className={mode === 'document' ? 'is-active' : ''} onClick={() => setMode('document')} role="radio" type="button"><FileUp size={15} /><span><strong>Attach proof</strong><small>Photo or PDF, marked verified</small></span></button>
          </div>

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
                  {field.type === 'priority'
                    ? <select id={inputId} onChange={(event) => updateValue(field.key, event.target.value)} value={values[field.key]}><option value="protected">Priority</option><option value="standard">Standard</option></select>
                    : <input id={inputId} inputMode={field.type === 'integer' ? 'numeric' : field.type === 'money' ? 'decimal' : undefined} onChange={(event) => updateValue(field.key, event.target.value)} placeholder={field.required ? '' : 'Unknown'} type={field.type === 'datetime' ? 'datetime-local' : 'text'} value={values[field.key]} />}
                  <div className="editor-field-meta">
                    {field.isFact && (values[field.key] ?? '').trim() !== '' && <EvidenceMark evidence={evidenceFor(field.key, values[field.key])} />}
                    {fieldOrigin === 'document' && quotes[field.key] && <small className="editor-quote">“{quotes[field.key]}”</small>}
                    {mode === 'document' && documentName && field.extractable && fieldOrigin !== 'document' && <small className="editor-missing">Not found in the document</small>}
                  </div>
                  {showErrors && 'error' in result && <small className="editor-error">{result.error}</small>}
                </div>
              )
            })}
          </div>}
        </div>}

        {step === 'review' && <div className="assistant-body editor-body">
          <p className="editor-review-intro">Is this right? Nothing is saved until you confirm.</p>
          {changedFields.length === 0
            ? <p className="editor-empty">No changes to save.</p>
            : <ul className="editor-changes">
              {changedFields.map((field) => (
                <li key={field.key}>
                  <span>{field.label}</span>
                  <span className="editor-change-values"><s>{displayValue(field, config.initial[field.key] ?? '')}</s><ArrowRight size={13} /><strong>{displayValue(field, values[field.key] ?? '')}</strong></span>
                  {field.isFact && <EvidenceMark evidence={evidenceFor(field.key, 'value' in parsed[field.key] ? (parsed[field.key] as { value: ParsedValue }).value : null)} />}
                </li>
              ))}
            </ul>}
          {after && <div className="editor-impact">
            <p className="reply-label">WHAT THIS CHANGES</p>
            {before.impact.casesExposed === after.impact.casesExposed && before.impact.affectedOrderCount === after.impact.affectedOrderCount
              ? <small>The shortage stays at {after.impact.casesExposed} cases across {after.impact.affectedOrderCount} orders until you approve a plan.</small>
              : <div className="editor-impact-stats">
                <span>Cases exposed <strong>{before.impact.casesExposed} → {after.impact.casesExposed}</strong></span>
                <span>Orders at risk <strong>{before.impact.affectedOrderCount} → {after.impact.affectedOrderCount}</strong></span>
              </div>}
            {planChanges.length === 0
              ? <small>No recovery option changes.</small>
              : <ul>{planChanges.map(({ plan, previous }) => (
                <li key={plan.id}><strong>{plan.title}</strong><span>{previous ? `${previous.statusLabel} → ` : 'New option · '}{plan.statusLabel}</span><small>{plan.impact}</small></li>
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
