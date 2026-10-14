import { FileUp, PencilLine, TriangleAlert, X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import type { RecoveryPlan, UnverifiedFact } from '../../data/demoDistributor'

type ApprovalWarningProps = {
  plan: RecoveryPlan
  onApproveAnyway: () => void
  onVerify: (target: UnverifiedFact['target']) => void
  onClose: () => void
}

export function ApprovalWarning({ plan, onApproveAnyway, onVerify, onClose }: ApprovalWarningProps) {
  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel approval" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="approval-warning-title" aria-modal="true" className="approval-dialog" role="dialog">
        <header>
          <span className="approval-dialog-icon"><TriangleAlert size={19} /></span>
          <div><h2 id="approval-warning-title">Some details are unverified</h2><p>{plan.title}</p></div>
          <Button aria-label="Cancel approval" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">This plan relies on details that were typed in, not checked against a document. Take a quick look for mistakes, attach proof, or approve with a warning.</p>
        <ul className="approval-facts">
          {plan.unverifiedFacts.map((fact, index) => {
            // One document usually proves several details of the same record; offer it once per record.
            const firstForTarget = plan.unverifiedFacts.findIndex((item) => JSON.stringify(item.target) === JSON.stringify(fact.target)) === index
            return (
              <li key={`${fact.label}-${fact.value}`}>
                <PencilLine aria-hidden="true" size={14} />
                <span><strong>{fact.label}</strong><small>{fact.value}</small></span>
                {firstForTarget ? <Button icon={<FileUp size={14} />} onClick={() => onVerify(fact.target)} variant="quiet">Attach proof</Button> : <span />}
              </li>
            )
          })}
        </ul>
        <footer>
          <Button onClick={onClose} variant="quiet">Cancel</Button>
          <Button onClick={onApproveAnyway} variant="primary">Approve with warning</Button>
        </footer>
      </section>
    </div>
  )
}
