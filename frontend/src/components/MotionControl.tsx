import { useLayoutEffect } from 'react'
import { type MotionPreference, setMotionPreference, useMotionPreference } from '~/lib/motion'

export function MotionControl() {
  const preference = useMotionPreference()
  useLayoutEffect(() => {
    document.documentElement.dataset.motion = preference
  }, [preference])
  return (
    <label className="inline-flex shrink-0 items-center gap-1 text-xs text-ink-muted">
      <span className="max-sm:sr-only">Motion</span>
      <select
        aria-label="Animation preference"
        value={preference}
        onChange={(event) => setMotionPreference(event.target.value as MotionPreference)}
        className="cursor-pointer rounded border border-line bg-bg px-1 py-1 text-ink"
      >
        <option value="system">System</option>
        <option value="full">On</option>
        <option value="reduced">Reduced</option>
      </select>
    </label>
  )
}
