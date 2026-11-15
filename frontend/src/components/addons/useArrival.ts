import { useRef } from 'react'

/**
 * `reveal` once the answer arrives after a wait in this view, and nothing when it was ready on arrival (a cached
 * result, or switching back to an add-on): the staggered entrance marks a computation finishing, not a tab switch.
 */
export function useArrival(loading: boolean) {
  const waited = useRef(false)
  if (loading) waited.current = true
  return !loading && waited.current ? 'reveal' : ''
}
