import type { Goal } from '../../../../shared/planner/model'
import { goals } from '../../presentation/goals'

/** Which option counts as best. Saved with the business; options re-rank straight away. */
export function GoalPicker({ goal, onChange }: { goal: Goal | undefined; onChange: (goal: Goal) => void }) {
  const current = goal ?? 'protect'
  return (
    <fieldset className="goal-picker">
      <legend>What matters most right now?</legend>
      <div className="goal-options" role="radiogroup">
        {goals.map((item) => (
          <label className={`goal-option ${current === item.id ? 'is-selected' : ''}`} key={item.id}>
            <input checked={current === item.id} name="goal" onChange={() => onChange(item.id)} type="radio" value={item.id} />
            <strong>{item.label}</strong>
            <small>{item.description}</small>
          </label>
        ))}
      </div>
    </fieldset>
  )
}
