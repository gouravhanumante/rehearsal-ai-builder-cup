import type { ReactNode } from 'react'

type EmptyStateProps = {
  icon?: ReactNode
  title: string
  body: string
  children?: ReactNode
}

export function EmptyState({ icon, title, body, children }: EmptyStateProps) {
  return (
    <div className="empty-state">
      {icon && <span className="empty-state-icon" aria-hidden="true">{icon}</span>}
      <h3>{title}</h3>
      <p>{body}</p>
      {children && <div className="empty-state-actions">{children}</div>}
    </div>
  )
}
