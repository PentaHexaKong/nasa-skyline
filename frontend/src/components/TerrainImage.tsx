import { useEffect, useRef, useState } from 'react'
import { loadTerrain } from '~/lib/data'
import { relief } from '~/lib/landscape'

const previews = new Map<string, Promise<string>>()
/** A cached, still hillshade of the project's LOLA tile, using an illustrative reading light. */
function preview(siteId: string) {
  const cached = previews.get(siteId)
  if (cached) return cached
  const pending = loadTerrain(siteId)
    .then((terrain) => {
      const light = relief(terrain, 315, 35)
      const n = terrain.meta.n
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = n
      const context = canvas.getContext('2d')
      if (!context) throw new Error('No terrain preview canvas')
      const image = context.createImageData(n, n)
      for (let i = 0; i < light.length; i++) {
        const grey = Math.round(25 + 220 * (light[i] ?? 0))
        image.data.set([grey, grey, grey, 255], i * 4)
      }
      context.putImageData(image, 0, 0)
      return canvas.toDataURL('image/webp', 0.85)
    })
    .catch((error) => {
      previews.delete(siteId)
      throw error
    })
  previews.set(siteId, pending)
  return pending
}

export function TerrainImage({ siteId, className = '' }: { siteId: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [src, setSrc] = useState<string>()
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    setSrc(undefined)
    setFailed(false)
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        observer.disconnect()
        void preview(siteId)
          .then((image) => {
            if (active) setSrc(image)
          })
          .catch(() => {
            if (active) setFailed(true)
          })
      },
      { rootMargin: '120px' },
    )
    if (ref.current) observer.observe(ref.current)
    return () => {
      active = false
      observer.disconnect()
    }
  }, [siteId])
  return (
    <div ref={ref} className={`overflow-hidden bg-[#11151b] ${className}`}>
      <div className="relative size-full">
        {src && <img src={src} alt="" aria-hidden className="absolute inset-0 size-full object-cover" />}
        {failed && <span className="absolute inset-0 grid place-items-center p-4 text-xs text-ink-muted">Terrain preview unavailable</span>}
      </div>
    </div>
  )
}
