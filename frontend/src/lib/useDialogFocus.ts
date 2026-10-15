import { useCallback, useRef } from 'react'

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
const FIELD = 'input:not([disabled]):not([type=hidden]), select:not([disabled]), textarea:not([disabled])'

/** Attach to a modal: focus moves in when it opens, Tab stays inside, and focus returns to the opener when it closes. */
export function useDialogFocus<T extends HTMLElement>() {
  const cleanup = useRef<(() => void) | null>(null)
  return useCallback((node: T | null) => {
    cleanup.current?.()
    cleanup.current = null
    if (!node) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const items = () => [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => element.getClientRects().length > 0)
    const start = node.querySelector<HTMLElement>(FIELD) ?? items()[0]
    if (start) start.focus()
    else { node.tabIndex = -1; node.focus() }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const list = items()
      if (list.length === 0) { event.preventDefault(); return }
      const first = list[0]
      const last = list[list.length - 1]
      const outside = !node.contains(document.activeElement)
      if (event.shiftKey && (outside || document.activeElement === first)) { event.preventDefault(); last.focus() }
      else if (!event.shiftKey && (outside || document.activeElement === last)) { event.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    cleanup.current = () => {
      document.removeEventListener('keydown', onKey)
      if (opener?.isConnected) opener.focus()
    }
  }, [])
}
