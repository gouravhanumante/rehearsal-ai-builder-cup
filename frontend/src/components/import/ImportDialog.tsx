import { useMemo, useState, type ChangeEvent } from 'react'
import { ArrowLeft, ArrowRight, FileUp, LoaderCircle, Sparkles, TriangleAlert, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { importKinds, type ImportKind } from '../../../../shared/import/fields'
import type { Workspace } from '../../../../shared/planner/model'
import { buildImport, type DateOrder } from '../../import/build'
import { autoMatch, missingRequired, type Mapping } from '../../import/match'
import { SEND_SAMPLE_ROWS, suggestMapping } from '../../import/suggest'
import { readTable, type Table } from '../../import/table'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useEscapeKey } from '../../lib/useEscapeKey'
import { useWorkspaceView } from '../../presentation/workspaceView'

type ImportDialogProps = {
  kind: ImportKind
  onApply: (next: Workspace, summary: string) => void
  onClose: () => void
}

const MONTH_FIRST_COUNTRIES = new Set(['US', 'PH'])
const SHOWN_PROBLEMS = 15
const preview = (names: string[]) => `${names.slice(0, 6).join(', ')}${names.length > 6 ? ` and ${names.length - 6} more` : ''}`

export function ImportDialog({ kind, onApply, onClose }: ImportDialogProps) {
  const { workspace, format } = useWorkspaceView()
  const definition = importKinds[kind]
  const [table, setTable] = useState<Table | null>(null)
  const [mapping, setMapping] = useState<Mapping>({})
  const [dateOrder, setDateOrder] = useState<DateOrder>(MONTH_FIRST_COUNTRIES.has(workspace.settings.country) ? 'mdy' : 'dmy')
  const [step, setStep] = useState<'file' | 'columns' | 'review'>('file')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'reading' | 'asking' | null>(null)
  useEscapeKey(onClose)
  const dialogRef = useDialogFocus<HTMLElement>()

  const result = useMemo(() => (step === 'review' && table ? buildImport(workspace, kind, table, mapping, { dateOrder }) : null), [step, table, workspace, kind, mapping, dateOrder])
  const missing = table ? missingRequired(kind, mapping) : []
  const hasDates = definition.fields.some((field) => field.type === 'date')
  const changes = result ? result.added + result.updated : 0

  const chooseFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setError(null)
    setBusy('reading')
    try {
      const read = await readTable(file)
      setTable(read)
      setMapping(autoMatch(kind, read.headers))
      setStep('columns')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'That file could not be read.')
    } finally {
      setBusy(null)
    }
  }

  const askGemini = async () => {
    if (!table) return
    setError(null)
    setBusy('asking')
    try {
      const suggested = await suggestMapping(kind, table)
      // Keep what was already matched by name; Gemini fills the gaps.
      const used = new Set(Object.values(mapping).filter((column): column is number => column !== null))
      setMapping((current) => Object.fromEntries(definition.fields.map((field) => {
        const keep = current[field.key] ?? null
        const proposed = suggested[field.key] ?? null
        return [field.key, keep ?? (proposed !== null && !used.has(proposed) ? proposed : null)]
      })))
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Gemini could not match the columns.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="assistant-overlay">
      <button aria-label="Close import" className="assistant-scrim" onClick={onClose} type="button" />
      <aside aria-labelledby="import-title" aria-modal="true" className="assistant-panel editor-panel" ref={dialogRef} role="dialog">
        <header className="assistant-header">
          <span className="assistant-icon"><FileUp size={19} /></span>
          <div><h2 id="import-title">Import {definition.label.toLowerCase()}</h2><p>{step === 'file' ? 'Step 1 of 3 · Choose a file' : step === 'columns' ? 'Step 2 of 3 · Match the columns' : 'Step 3 of 3 · Check before saving'}</p></div>
          <Button aria-label="Close import" className="assistant-close" icon={<X size={18} />} onClick={onClose} title="Close" variant="quiet" />
        </header>

        {step === 'file' && <div className="assistant-body editor-body">
          <div className="editor-upload">
            <p>{definition.description}</p>
            <p>Columns Rehearsal looks for: {definition.fields.map((field) => `${field.label}${field.required ? '' : ' (optional)'}`).join(', ')}.</p>
            <label className={`ds-button ds-button--secondary editor-file-button ${busy ? 'is-busy' : ''}`}>
              {busy === 'reading' ? <LoaderCircle className="spin-icon" size={15} /> : <FileUp size={15} />}
              {busy === 'reading' ? 'Reading file…' : 'Choose .csv or .xlsx file'}
              <input accept=".csv,.tsv,.txt,.xlsx" className="visually-hidden" disabled={busy !== null} onChange={chooseFile} type="file" />
            </label>
            <small>The file is read in your browser and not uploaded. Nothing is saved until you confirm.</small>
          </div>
          {error && <p aria-live="polite" className="not-sent-notice">{error}</p>}
        </div>}

        {step === 'columns' && table && <div className="assistant-body editor-body">
          <p className="editor-review-intro"><strong>{table.fileName}</strong> · {format.number(table.rows.length)} rows. Check which column holds what.</p>
          <div className="editor-fields">
            {definition.fields.map((field) => (
              <div className="editor-field" key={field.key}>
                <label htmlFor={`map-${field.key}`}>{field.label}{!field.required && <small> · optional</small>}</label>
                <select id={`map-${field.key}`} onChange={(event) => setMapping((current) => ({ ...current, [field.key]: event.target.value === '' ? null : Number(event.target.value) }))} value={mapping[field.key] ?? ''}>
                  <option value="">{field.required ? 'Choose a column…' : 'Not in this file'}</option>
                  {table.headers.map((header, index) => <option key={index} value={index}>{header}{table.rows[0]?.[index] ? ` — e.g. ${table.rows[0][index].slice(0, 24)}` : ''}</option>)}
                </select>
              </div>
            ))}
            {hasDates && <div className="editor-field">
              <label htmlFor="date-order">Dates like 04/10/2026 mean</label>
              <select id="date-order" onChange={(event) => setDateOrder(event.target.value as DateOrder)} value={dateOrder}>
                <option value="dmy">4 October (day first)</option>
                <option value="mdy">April 10 (month first)</option>
              </select>
            </div>}
          </div>
          {missing.length > 0 && <div className="import-suggest">
            <p>Not matched yet: {missing.map((field) => field.label).join(', ')}.</p>
            <Button disabled={busy !== null} icon={busy === 'asking' ? <LoaderCircle className="spin-icon" size={14} /> : <Sparkles size={14} />} onClick={askGemini} variant="secondary">Ask Gemini to match them</Button>
            <small>Sends the column names{SEND_SAMPLE_ROWS ? ' and the first three rows' : ''} to Google Gemini. The rest of the file stays in your browser.</small>
          </div>}
          {error && <p aria-live="polite" className="not-sent-notice">{error}</p>}
        </div>}

        {step === 'review' && result && <div className="assistant-body editor-body">
          {result.blocked && <p className="not-sent-notice" role="alert">{result.blocked}</p>}
          <div className="import-counts">
            <span><strong>{format.number(result.added)}</strong> new</span>
            <span><strong>{format.number(result.updated)}</strong> changed</span>
            <span><strong>{format.number(result.unchanged)}</strong> already the same</span>
            <span className={result.problems.length > 0 ? 'has-problems' : ''}><strong>{format.number(result.problems.length)}</strong> to fix</span>
          </div>
          {(result.newLocations.length > 0 || result.newProducts.length > 0) && <div className="editor-impact">
            <p className="reply-label">WILL BE ADDED TO YOUR LISTS</p>
            {result.newLocations.length > 0 && <small>Locations (added as stores — change the type later): {preview(result.newLocations)}</small>}
            {result.newProducts.length > 0 && <small>Products (counted in “units” — rename later): {preview(result.newProducts)}</small>}
          </div>}
          {result.notes.map((note) => <p className="editor-review-intro" key={note}>{note}</p>)}
          {result.problems.length > 0 && <div className="import-problems">
            <p className="reply-label"><TriangleAlert size={13} /> THESE ROWS WERE LEFT OUT</p>
            <ul>
              {result.problems.slice(0, SHOWN_PROBLEMS).map((problem, index) => <li key={index}><strong>Row {problem.row}</strong> {problem.message}</li>)}
            </ul>
            {result.problems.length > SHOWN_PROBLEMS && <small>…and {result.problems.length - SHOWN_PROBLEMS} more. Fix the file and import it again; rows already imported stay the same.</small>}
          </div>}
          {changes === 0 && !result.blocked && <p className="editor-empty">Nothing new to save from this file.</p>}
        </div>}

        <footer className="editor-footer">
          {step === 'file' && <Button onClick={onClose} variant="quiet">Cancel</Button>}
          {step === 'columns' && <><Button icon={<ArrowLeft size={15} />} onClick={() => { setStep('file'); setError(null) }} variant="quiet">Back</Button><Button disabled={missing.length > 0 || busy !== null} icon={<ArrowRight size={15} />} onClick={() => setStep('review')} variant="primary">Check the import</Button></>}
          {step === 'review' && result && <><Button icon={<ArrowLeft size={15} />} onClick={() => setStep('columns')} variant="quiet">Back</Button><Button disabled={changes === 0 || result.blocked !== null} onClick={() => onApply(result.workspace, `${definition.label} imported from ${table?.fileName ?? 'a file'}: ${result.added} added, ${result.updated} updated${result.problems.length ? `, ${result.problems.length} rows left out` : ''}`.slice(0, 400))} variant="primary">{changes === 0 ? 'Nothing to save' : `Save ${format.number(changes)} ${changes === 1 ? 'row' : 'rows'}`}</Button></>}
        </footer>
      </aside>
    </div>
  )
}
