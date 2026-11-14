import { type ReactNode, useEffect, useRef, useState } from 'react'
import { reducedMotion } from '~/lib/motion'

/** Native modal focus, Escape handling and inert background, with a short entrance and exit. */
export function SmoothDialog({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)
  const [present, setPresent] = useState(open)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      setPresent(true)
      setClosing(false)
      if (!dialog.open) dialog.showModal()
      const previous = document.documentElement.style.overflow
      document.documentElement.style.overflow = 'hidden'
      return () => {
        document.documentElement.style.overflow = previous
      }
    }
    if (dialog.open) {
      setClosing(true)
      const timer = window.setTimeout(
        () => {
          dialog.close()
          setPresent(false)
        },
        reducedMotion().matches ? 0 : 180,
      )
      return () => window.clearTimeout(timer)
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby="learning-dialog-title"
      className="learning-dialog"
      data-closing={closing || undefined}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return
        const rect = event.currentTarget.getBoundingClientRect()
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose()
      }}
    >
      <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-[#090c11] px-5 py-3 sm:px-7">
        <h2 id="learning-dialog-title" className="eyebrow text-ink-muted">
          Your lunar investigation
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close investigation"
          className="grid size-9 cursor-pointer place-items-center rounded-md border border-line text-xl hover:bg-surface-hover"
        >
          ×
        </button>
      </header>
      {(open || present) && children}
    </dialog>
  )
}
