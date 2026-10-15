import { X } from 'lucide-react'
import { Button } from '../../design-system/Button'
import { useEscapeKey } from '../../lib/useEscapeKey'

type ConfirmDialogProps = {
  title: string
  body: string
  confirmLabel: string
  cancelLabel?: string
  onConfirm: () => void
  onClose: () => void
}

export function ConfirmDialog({ title, body, confirmLabel, cancelLabel = 'Cancel', onConfirm, onClose }: ConfirmDialogProps) {
  useEscapeKey(onClose)
  return (
    <div className="dialog-overlay">
      <button aria-label="Cancel" className="assistant-scrim" onClick={onClose} type="button" />
      <section aria-labelledby="confirm-title" aria-modal="true" className="approval-dialog" role="dialog">
        <header>
          <div><h2 id="confirm-title">{title}</h2></div>
          <Button aria-label="Cancel" className="assistant-close" icon={<X size={18} />} onClick={onClose} variant="quiet" />
        </header>
        <p className="approval-dialog-intro">{body}</p>
        <footer>
          <Button onClick={onClose} variant="quiet">{cancelLabel}</Button>
          <Button onClick={onConfirm} variant="primary">{confirmLabel}</Button>
        </footer>
      </section>
    </div>
  )
}
