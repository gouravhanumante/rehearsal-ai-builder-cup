import { Scale } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { StatusBadge } from '../../design-system/StatusBadge'
import { useWorkspaceView } from '../../presentation/workspaceView'

type ConflictCardsProps = {
  onDecide: (conflictId: string, winner: 'earliest-due' | 'priority') => void
}

/** Asks who gets contested stock. Until answered, the earliest-due order keeps it. */
export function ConflictCards({ onDecide }: ConflictCardsProps) {
  const { rehearsal, words } = useWorkspaceView()
  if (rehearsal.conflicts.length === 0) return null

  return (
    <div className="conflict-list">
      {rehearsal.conflicts.map((conflict) => {
        const text = words.conflictText(conflict)
        return (
          <article className={`conflict-card ${conflict.decided ? 'is-decided' : ''}`} key={conflict.id}>
            <span className="conflict-icon"><Scale size={17} /></span>
            <div className="conflict-main">
              <div className="conflict-title"><h3>{text.question}</h3><StatusBadge tone={conflict.decided ? 'neutral' : 'warning'} dot>{conflict.decided ? 'Decided' : 'Needs your answer'}</StatusBadge></div>
              <p>{text.earlier} is due first, but {text.priority} is a priority order. {conflict.decided ? '' : 'Until you choose, the order due first keeps the stock, which gives more time to find stock for the later one.'}</p>
            </div>
            <div className="conflict-actions" role="group" aria-label={text.question}>
              <Button aria-pressed={conflict.winner === 'earliest-due'} onClick={() => onDecide(conflict.id, 'earliest-due')} variant={conflict.decided && conflict.winner === 'earliest-due' ? 'primary' : 'secondary'}>Order due first</Button>
              <Button aria-pressed={conflict.winner === 'priority'} onClick={() => onDecide(conflict.id, 'priority')} variant={conflict.decided && conflict.winner === 'priority' ? 'primary' : 'secondary'}>Priority order</Button>
            </div>
          </article>
        )
      })}
    </div>
  )
}
