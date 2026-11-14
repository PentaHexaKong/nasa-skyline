import { useHydrated, useRouterState } from '@tanstack/react-router'
import { lazy, Suspense, useLayoutEffect, useSyncExternalStore } from 'react'
import type { MoonScene } from '~/components/ParallaxMoon'
import type { MoonEphemeris } from '~/lib/data'

const loadMoon = () => import('~/components/ParallaxMoon')
if (typeof window !== 'undefined') void loadMoon()
const ParallaxMoon = lazy(loadMoon)

/**
 * One Moon for the front door, Explore, Understand and Analyze. It lives above the routes, so going from one of these
 * pages to another never draws a new Moon: the page says where the Moon should be (`useMoonScene`) and the same Moon
 * glides there. On Analyze it hands over to Analyze's own Moon, which the reader turns. On every other page it is gone.
 */
const PAGES = new Set(['/', '/explore', '/understand', '/analyze'])

let current: { scene: MoonScene; eph: MoonEphemeris } | null = null
const listeners = new Set<() => void>()
const subscribe = (f: () => void) => {
  listeners.add(f)
  return () => {
    listeners.delete(f)
  }
}

/**
 * Puts the Moon where this page wants it. Pass a stable `scene` (module constant or memo): a new object is a new place,
 * and the Moon glides to it. Set before the page's first paint, so the Moon never shows the old page's frame on the
 * new one. Leaving the scene in place on unmount is deliberate: the next page replaces it.
 */
export function useMoonScene(scene: MoonScene, eph: MoonEphemeris) {
  useLayoutEffect(() => {
    // Each page loads the ephemeris itself (and the first page's arrives from the server), so the same data comes as a
    // new object. A new object would rebuild the Moon from scratch; the same data keeps the one already on screen.
    const keep = current && sameEphemeris(current.eph, eph) ? current.eph : eph
    if (current?.scene === scene && current.eph === keep) return
    current = { scene, eph: keep }
    for (const f of listeners) f()
  }, [scene, eph])
}

/** The same ephemeris file: same start, step and samples (the samples checked at both ends and the middle). */
export function sameEphemeris(a: MoonEphemeris, b: MoonEphemeris) {
  if (a === b) return true
  if (a.start !== b.start || a.step_h !== b.step_h || a.frame !== b.frame) return false
  const n = a.subsolar_lat_deg.length
  if (n !== b.subsolar_lat_deg.length) return false
  return [0, n >> 1, n - 1].every(
    (i) =>
      a.subsolar_lat_deg[i] === b.subsolar_lat_deg[i] &&
      a.subsolar_lon_deg_east[i] === b.subsolar_lon_deg_east[i] &&
      a.subearth_lat_deg[i] === b.subearth_lat_deg[i] &&
      a.subearth_lon_deg_east[i] === b.subearth_lon_deg_east[i],
  )
}

export function MoonStage() {
  const hydrated = useHydrated()
  // The page on screen, not the one loading: the Moon stays on the old page until the new one shows.
  const path = useRouterState({ select: (s) => (s.resolvedLocation ?? s.location).pathname.replace(/\/$/, '') || '/' })
  const moon = useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  )
  if (!hydrated || !PAGES.has(path) || !moon) return null
  return (
    <>
      {/* The front door's night sky, behind the Moon; it fades as the Moon leaves for a tour page. */}
      <div
        aria-hidden
        className={`starfield pointer-events-none fixed inset-x-0 top-0 z-0 h-[100lvh] transition-opacity duration-[1600ms] ease-in-out motion-reduce:transition-none ${
          moon.scene.kind === 'horizon' ? 'opacity-100' : 'opacity-0'
        }`}
      />
      <Suspense fallback={null}>
        <ParallaxMoon scene={moon.scene} eph={moon.eph} />
      </Suspense>
    </>
  )
}
