import { useLayoutEffect, useRef, useState } from 'react'

/** Width of an element in CSS px, tracked with ResizeObserver. Starts at `fallback` for SSR. */
export function useWidth<T extends HTMLElement>(fallback = 960) {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => entry && setWidth(Math.round(entry.contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width] as const
}
