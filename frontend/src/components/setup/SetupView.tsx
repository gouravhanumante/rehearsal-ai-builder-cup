import type { ReactNode } from 'react'
import { CircleCheck, Circle } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { setupProgress, type SetupStepId } from '../../presentation/setup'
import { useWorkspaceView } from '../../presentation/workspaceView'

export type SetupAction = { label: string; icon?: ReactNode; onClick: () => void; primary?: boolean }

type SetupViewProps = {
  actions: Partial<Record<SetupStepId, SetupAction[]>>
}

export function SetupView({ actions }: SetupViewProps) {
  const { workspace, format } = useWorkspaceView()
  const progress = setupProgress(workspace)
  const percent = Math.round((progress.requiredDone / progress.requiredTotal) * 100)

  return (
    <section className="data-view setup-view" aria-labelledby="setup-title">
      <div className="section-heading data-view-heading">
        <div>
          <p className="section-kicker">SETUP · {workspace.businessName.toUpperCase()}</p>
          <h2 id="setup-title">{progress.next ? 'Tell Rehearsal about your business' : 'Your business is set up'}</h2>
          <p className="data-view-description">Add what you know, in any order. You don&apos;t need everything — anything missing stays &ldquo;unknown&rdquo; and Rehearsal tells you when it matters.</p>
        </div>
      </div>
      <div aria-label="Setup progress" aria-valuemax={100} aria-valuemin={0} aria-valuenow={percent} className="setup-progress" role="progressbar">
        <span style={{ width: `${percent}%` }} />
      </div>
      <p className="setup-progress-text">{progress.requiredDone} of {progress.requiredTotal} steps started · {format.settings.currency} · {format.settings.timeZone}</p>
      <ol className="setup-steps">
        {progress.steps.map((step) => (
          <li className={`setup-step ${step.done ? 'is-done' : ''} ${progress.next?.id === step.id ? 'is-next' : ''}`} key={step.id}>
            <span className="setup-step-icon" aria-hidden="true">{step.done ? <CircleCheck size={18} /> : <Circle size={18} />}</span>
            <div className="setup-step-main">
              <div className="setup-step-title">
                <h3>{step.title}</h3>
                {step.optional && <StatusBadge tone="neutral">Optional</StatusBadge>}
                {progress.next?.id === step.id && <StatusBadge tone="warning" dot>Next</StatusBadge>}
              </div>
              <p>{step.description}</p>
              <small>{step.count === 0 ? 'Nothing added yet' : `${format.number(step.count)} added`}</small>
            </div>
            <div className="setup-step-actions">
              {(actions[step.id] ?? []).map((action) => (
                <Button icon={action.icon} key={action.label} onClick={action.onClick} variant={action.primary ? 'primary' : 'secondary'}>{action.label}</Button>
              ))}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}
