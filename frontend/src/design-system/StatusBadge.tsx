type StatusTone = 'success' | 'warning' | 'danger' | 'neutral'

type StatusBadgeProps = {
  children: string
  tone: StatusTone
  dot?: boolean
}

export function StatusBadge({ children, dot = false, tone }: StatusBadgeProps) {
  return (
    <span className={`ds-status-badge ds-status-badge--${tone}`}>
      {dot && <span className="ds-status-badge__dot" aria-hidden="true" />}
      {children}
    </span>
  )
}
