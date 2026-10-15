import { FileUp, PencilLine, Scale, TriangleAlert, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { Plan } from '../../../../shared/planner/plan'
import { useDialogFocus } from '../../lib/useDialogFocus'
import { useEscapeKey } from '../../lib/useEscapeKey'
import type { EditTarget } from '../../presentation/planText'
import { useWorkspaceView } from '../../presentation/workspaceView'

type ApprovalWarningProps = {
  plan: Plan
  onApproveAnyway: () => void
  onVerify: (target: EditTarget) => void
  onAnswerConflicts: () => void
  onClose: () => void
}

export function ApprovalWarning({ plan, onApproveAnyway, onVerify, onAnswerConflicts, onClose }: ApprovalWarningProps) {
  useEscapeKey(onClose)
  const dialogRef = useDialogFocus<HTMLElement>()
  const { rehearsal, words } = useWorkspaceView()
  const facts = plan.unverified.map(words.unverifiedText)
  const openConflicts = rehearsal.conflicts.filter((conflict) => !conflict.decided)

  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel approval" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="approval-warning-title" aria-modal="true" className="approval-dialog" ref={dialogRef} role="dialog">
        <header>
          <span className="approval-dialog-icon"><TriangleAlert size={19} /></span>
          <div><h2 id="approval-warning-title">Check before approving</h2><p>{words.planText(plan).title}</p></div>
          <Button aria-label="Cancel approval" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        {facts.length > 0 && <>
          <p className="approval-dialog-intro">This plan relies on details that were typed in, not checked against a document. Take a quick look for mistakes, attach proof, or approve with a warning.</p>
          <ul className="approval-facts">
            {facts.map((fact, index) => {
              // One document usually proves several details of the same record; offer it once per record.
              const firstForTarget = facts.findIndex((item) => JSON.stringify(item.target) === JSON.stringify(fact.target)) === index
              return (
                <li key={`${fact.label}-${fact.value}`}>
                  <PencilLine aria-hidden="true" size={14} />
                  <span><strong>{fact.label}</strong><small>{fact.value}</small></span>
                  {firstForTarget ? <Button icon={<FileUp size={14} />} onClick={() => onVerify(fact.target)} variant="quiet">Attach proof</Button> : <span />}
                </li>
              )
            })}
          </ul>
        </>}
        {openConflicts.length > 0 && <div className="approval-conflicts">
          <Scale aria-hidden="true" size={15} />
          <span><strong>{openConflicts.length} stock conflict{openConflicts.length === 1 ? ' is' : 's are'} unanswered.</strong> If you approve now, the order due first keeps the stock.</span>
          <Button onClick={onAnswerConflicts} variant="quiet">Answer now</Button>
        </div>}
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button onClick={onApproveAnyway} variant="primary">Approve with warning</Button>
        </footer>
      </section>
    </div>
  )
}
