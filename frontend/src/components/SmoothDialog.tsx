import { KumoPortalProvider } from '@cloudflare/kumo'
import { XIcon } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { reducedMotion } from '~/lib/motion'

/**
 * Native modal focus, Escape handling and inert background, with a short entrance and exit. `nav` sits in the sticky
 * header beside the title, so a multi-step flow keeps its place in view while the body scrolls.
 */
export function SmoothDialog({
  open,
  onClose,
  nav,
  children,
}: {
  open: boolean
  onClose: () => void
  nav?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [closing, setClosing] = useState(false)
  const [present, setPresent] = useState(open)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open) {
      setPresent(true)
      setClosing(false)
      if (!dialog.open) {
        dialog.showModal()
        // showModal focuses the first control, which paints the close button as if it were selected. Focus the
        // dialog itself instead: screen readers still announce its title, and Tab still reaches every control.
        dialog.focus()
      }
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
      tabIndex={-1}
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
      <header className="sticky top-0 z-10 flex h-14 items-stretch justify-between gap-4 border-b border-line bg-[#090c11] pr-3 pl-5 sm:pr-4 sm:pl-7">
        <div className="flex min-w-0 items-stretch gap-4 lg:gap-8">
          <h2 id="learning-dialog-title" className={`eyebrow self-center text-ink-muted ${nav ? 'hidden lg:block' : ''}`}>
            Lunar investigation
          </h2>
          {nav && <span aria-hidden className="my-4 hidden w-px bg-line lg:block" />}
          {nav}
        </div>
        <div className="flex items-center gap-2">
          <kbd className="readout hidden rounded border border-line px-1.5 py-0.5 text-2xs text-ink-faint pointer-fine:inline">Esc</kbd>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close investigation"
            className="grid size-9 cursor-pointer place-items-center rounded-md text-ink-muted transition-[background-color,color,scale] duration-150 ease-out hover:bg-surface-hover hover:text-ink active:scale-[0.96] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-story"
          >
            <XIcon aria-hidden size={18} />
          </button>
        </div>
      </header>
      {/* Overlays must portal inside the modal: body sits under the top layer and is inert. */}
      <KumoPortalProvider container={ref}>{(open || present) && children}</KumoPortalProvider>
    </dialog>
  )
}
