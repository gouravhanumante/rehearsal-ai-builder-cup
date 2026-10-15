import { ArrowRight, CircleHelp, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { type Plan } from '../../../../shared/planner/plan'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { openQuestions } from '../../presentation/questions'
import { problemsOf } from '../../presentation/problems'
import { goalLabel } from '../../presentation/goals'

type OverviewRecommendationProps = {
  onApprove: (plan: Plan) => void
  onViewOptions: () => void
}

export function OverviewRecommendation({ onApprove, onViewOptions }: OverviewRecommendationProps) {
  const { workspace, rehearsal, words } = useWorkspaceView()
  const problems = problemsOf(workspace, rehearsal, words)
  const openConflicts = rehearsal.conflicts.filter((conflict) => !conflict.decided).length
  const approval = workspace.approval
  const pending = openQuestions(workspace, rehearsal)
  const questionCount = pending.routes.length + pending.deliveries.length
  const many = problems.length > 1

  return (
    <div className="overview-problems">
      {many && <p className="section-kicker overview-problems-kicker">BEST FIX FOR EACH PROBLEM · {problems.length} PROBLEMS · {goalLabel(workspace.goal).toUpperCase()}</p>}
      {problems.map(({ group, best: plan, title }, index) => {
        const short = `${words.quantity(group.exposedQuantity, group.productId)} short`
        const headingId = `recommendation-title-${index}`
        if (!plan) {
          return (
            <section className="overview-recommendation overview-recommendation--empty" aria-labelledby={headingId} key={title}>
              <div className="recommendation-icon"><CircleHelp size={19} /></div>
              <div className="recommendation-main">
                <p className="section-kicker">{many ? `${title.toUpperCase()} · ${short.toUpperCase()}` : 'NO OPTION IS READY YET'}</p>
                <h2 id={headingId}>{many ? 'No workable option yet' : questionCount > 0 ? 'Answer a question to check more options' : 'Add the missing details to check more options'}</h2>
                <p>{many ? 'See what would help: a backup supplier, an existing supplier who may sell it, or a delivery already on its way.' : 'None of the recovery options can be confirmed with the details we have.'}</p>
              </div>
              <div className="recommendation-actions"><Button icon={<ArrowRight size={14} />} onClick={onViewOptions} variant="primary">See next steps</Button></div>
            </section>
          )
        }
        const text = words.planText(plan)
        const unverified = plan.unverified.length > 0
        return (
          <section className="overview-recommendation" aria-labelledby={headingId} key={title}>
            <div className="recommendation-icon">{unverified ? <TriangleAlert size={19} /> : <ShieldCheck size={19} />}</div>
            <div className="recommendation-main">
              <div className="recommendation-title"><p className="section-kicker">{many ? `${title.toUpperCase()} · ${short.toUpperCase()}` : `BEST OPTION · ${goalLabel(workspace.goal).toUpperCase()}`}</p><StatusBadge tone={unverified ? 'warning' : 'success'} dot>{text.statusLabel}</StatusBadge></div>
              <h2 id={headingId}>{text.title}</h2>
              <p>{text.detail}</p>
              <div className="recommendation-outcome"><strong>{text.impact}</strong><span>{text.cost}</span></div>
              {text.worthNote && <p className="option-worth"><TriangleAlert size={13} /> {text.worthNote}</p>}
            </div>
            <div className="recommendation-actions">
              {approval?.planId === plan.id
                ? <span className="approved-label"><ShieldCheck size={15} /> Approved for demo{approval.withWarning ? ' · with warning' : ''}</span>
                : <Button onClick={() => onApprove(plan)} variant="primary">Approve plan</Button>}
              <Button className="all-options-link" icon={<ArrowRight size={14} />} onClick={onViewOptions} variant="quiet">Compare all options</Button>
            </div>
          </section>
        )
      })}
      {(openConflicts > 0 || questionCount > 0) && <div className="overview-problems-notes">
        {openConflicts > 0 && <p className="recommendation-conflicts"><TriangleAlert size={13} /> {openConflicts} stock conflict{openConflicts === 1 ? ' needs' : 's need'} your answer. <button onClick={onViewOptions} type="button">Answer now</button></p>}
        {questionCount > 0 && <p className="recommendation-conflicts"><CircleHelp size={13} /> {questionCount} {questionCount === 1 ? 'question' : 'questions'} could unlock more options. <button onClick={onViewOptions} type="button">Answer</button></p>}
      </div>}
    </div>
  )
}
