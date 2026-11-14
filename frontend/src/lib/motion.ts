import { useSyncExternalStore } from 'react'

export type MotionPreference = 'system' | 'full' | 'reduced'
const KEY = 'skyline-motion'
const CHANGE = 'skyline-motion-change'
let preference: MotionPreference | undefined

export function getMotionPreference(): MotionPreference {
  if (typeof window === 'undefined') return 'system'
  if (preference === undefined) {
    try {
      const stored = window.localStorage.getItem(KEY)
      preference = stored === 'full' || stored === 'reduced' ? stored : 'system'
    } catch {
      preference = 'system'
    }
  }
  return preference
}

export function setMotionPreference(next: MotionPreference) {
  preference = next
  document.documentElement.dataset.motion = next
  try {
    window.localStorage.setItem(KEY, next)
  } catch {
    // The preference still works for this visit when storage is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE))
}

/** One preference for CSS and WebGL, with live changes from the site control or the OS. */
export function reducedMotion() {
  const system = window.matchMedia('(prefers-reduced-motion: reduce)')
  return {
    get matches() {
      const mode = getMotionPreference()
      return mode === 'reduced' || (mode === 'system' && system.matches)
    },
    addEventListener(_type: 'change', listener: () => void) {
      system.addEventListener('change', listener)
      window.addEventListener(CHANGE, listener)
    },
    removeEventListener(_type: 'change', listener: () => void) {
      system.removeEventListener('change', listener)
      window.removeEventListener(CHANGE, listener)
    },
  }
}

const subscribe = (listener: () => void) => {
  const motion = reducedMotion()
  motion.addEventListener('change', listener)
  return () => motion.removeEventListener('change', listener)
}

export function useReducedMotion() {
  return useSyncExternalStore(
    subscribe,
    () => reducedMotion().matches,
    () => true,
  )
}

export function useMotionPreference() {
  return useSyncExternalStore(subscribe, getMotionPreference, () => 'system' as const)
}
