import { PauseCircleIcon, XIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { setMotionPreference, useMotionPreference } from '~/lib/motion'

const DISMISSED = 'skyline-motion-notice'

/**
 * Says so when the site holds every animation still because the device asks for less motion (on Windows: Settings →
 * Accessibility → Visual effects → Animation effects off), and offers one tap to turn motion on for this site. It only
 * shows while the preference is System, so choosing On or Reduced in the header, or closing it, puts it away.
 */
export function MotionNotice() {
  const preference = useMotionPreference()
  const [systemReduce, setSystemReduce] = useState(false)
  const [dismissed, setDismissed] = useState(true)
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setSystemReduce(q.matches)
    on()
    q.addEventListener('change', on)
    try {
      setDismissed(window.sessionStorage.getItem(DISMISSED) === '1')
    } catch {
      setDismissed(false)
    }
    return () => q.removeEventListener('change', on)
  }, [])
  if (!systemReduce || preference !== 'system' || dismissed) return null
  return (
    <div role="status" className="relative z-(--z-sticky) border-b border-line bg-black">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 text-sm sm:px-6">
        <PauseCircleIcon aria-hidden className="size-5 shrink-0 text-ink-muted" />
        <p className="min-w-0 flex-1 text-ink-muted text-pretty">
          <span className="text-ink">Animations are paused.</span> Your device asks for reduced motion (on Windows: Animation effects is
          off), so the Moon and the cards hold still.
        </p>
        <button
          type="button"
          onClick={() => setMotionPreference('full')}
          className="cursor-pointer rounded-full bg-white px-4 py-1.5 font-medium text-black transition-opacity hover:opacity-90"
        >
          Turn motion on
        </button>
        <button
          type="button"
          aria-label="Keep animations paused and close this note"
          onClick={() => {
            setDismissed(true)
            try {
              window.sessionStorage.setItem(DISMISSED, '1')
            } catch {
              // Closing still works for this page view.
            }
          }}
          className="grid size-8 cursor-pointer place-items-center rounded-full text-ink-muted hover:bg-white/10 hover:text-ink"
        >
          <XIcon aria-hidden />
        </button>
      </div>
    </div>
  )
}
