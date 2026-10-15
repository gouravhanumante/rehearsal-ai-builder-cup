import { CalendarClock, ClipboardCheck, FileUp, History, PackageCheck, PencilLine, ShoppingBag } from 'lucide-react'
import type { HistoryKind } from '../../../../shared/planner/model'
import { useWorkspaceView } from '../../presentation/workspaceView'
import { EmptyState } from '../layout/EmptyState'

const kinds: Record<HistoryKind, { label: string; icon: typeof History }> = {
  delay: { label: 'Delay', icon: CalendarClock },
  approval: { label: 'Approved', icon: ClipboardCheck },
  received: { label: 'Received', icon: PackageCheck },
  order: { label: 'Order', icon: ShoppingBag },
  edit: { label: 'Change', icon: PencilLine },
  import: { label: 'Import', icon: FileUp },
}

/** Read-only record of what was decided and what happened, newest first. */
export function HistoryView() {
  const { workspace, format } = useWorkspaceView()
  const entries = [...(workspace.history ?? [])].reverse()
  return (
    <section aria-labelledby="history-title" className="data-view">
      <div className="section-heading data-view-heading">
        <div><p className="section-kicker">WHAT HAPPENED</p><h2 id="history-title">History</h2><p className="data-view-description">Delays reported, plans approved, deliveries received, orders closed and changes saved. It cannot be edited.</p></div>
      </div>
      {entries.length === 0
        ? <EmptyState body="Approvals, delays, deliveries received and changes you save appear here, newest first." icon={<History size={20} />} title="Nothing recorded yet" />
        : <ol className="history-list">
          {entries.map((entry, index) => {
            const { label, icon: Icon } = kinds[entry.kind]
            return (
              <li className={`history-entry history-${entry.kind}`} key={`${entry.at}-${index}`}>
                <Icon aria-hidden="true" size={16} />
                <span className="history-kind">{label}</span>
                <span className="history-text">{entry.text}</span>
                <time dateTime={entry.at}>{format.dateTime(entry.at)}</time>
              </li>
            )
          })}
        </ol>}
    </section>
  )
}
