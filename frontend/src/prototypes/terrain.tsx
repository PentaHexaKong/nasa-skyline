import { type ReactNode, useEffect, useRef, useState } from 'react'
import { loadTerrain, type Terrain } from '~/lib/data'

export const SITE = 'connecting-ridge'

export function useTerrain() {
  const [terrain, setTerrain] = useState<Terrain | null>(null)
  useEffect(() => {
    let live = true
    loadTerrain(SITE).then((t) => live && setTerrain(t))
    return () => {
      live = false
    }
  }, [])
  return terrain
}

/** Kumo's mode switch: <html data-mode="dark">, removed for light. */
export function useDark() {
  const [dark, setDark] = useState(true)
  useEffect(() => {
    const read = () => setDark(document.documentElement.dataset.mode === 'dark')
    read()
    const mo = new MutationObserver(read)
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-mode'] })
    return () => mo.disconnect()
  }, [])
  return dark
}

export type Rgb = [number, number, number]

/** A design token as sRGB bytes, so canvas pixels can use the same colours as the CSS. */
export function rgbOf(token: string): Rgb {
  if (typeof document === 'undefined') return [128, 128, 128]
  // A probe element resolves light-dark() and var(); the canvas turns the result into bytes.
  const el = document.createElement('i')
  el.style.color = `var(${token})`
  document.body.append(el)
  const color = getComputedStyle(el).color
  el.remove()
  const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true })
  if (!probe) return [128, 128, 128]
  probe.fillStyle = color
  probe.fillRect(0, 0, 1, 1)
  const [r = 128, g = 128, b = 128] = probe.getImageData(0, 0, 1, 1).data
  return [r, g, b]
}

const height = ({ meta, heights }: Terrain, col: number, row: number) => {
  const c = Math.max(0, Math.min(meta.n - 1, col))
  const r = Math.max(0, Math.min(meta.n - 1, row))
  return heights[r * meta.n + c] ?? 0
}

/** Ground slope in degrees over a baseline of `step` cells each way. */
export function slopeDeg(t: Terrain, col: number, row: number, step = 1) {
  const run = 2 * step * t.meta.cell_m
  const dx = (height(t, col + step, row) - height(t, col - step, row)) / run
  const dy = (height(t, col, row - step) - height(t, col, row + step)) / run
  return (Math.atan(Math.hypot(dx, dy)) * 180) / Math.PI
}

/** A square window on the terrain: centre in metres east and north of the site, and half its width. */
export type View = { east: number; north: number; half: number }
export type Tint = (col: number, row: number, px: number, py: number) => readonly [number, number, number, number] | undefined

const PX = 520

/**
 * Real LOLA terrain as shaded relief, with an optional per-cell tint and an SVG overlay in metres
 * (x east, y south). The relief is lit from the north-west by convention; it is not the Sun's lighting.
 */
export function TerrainMap({
  terrain,
  view,
  tint,
  stamp,
  label,
  children,
}: {
  terrain: Terrain
  view: View
  tint?: Tint
  /** Changes whenever the tint's inputs change. */
  stamp?: string | number
  label: string
  children?: ReactNode
}) {
  const ref = useRef<HTMLCanvasElement>(null)
  const dark = useDark()
  const tintRef = useRef(tint)
  tintRef.current = tint

  useEffect(() => {
    const ctx = ref.current?.getContext('2d')
    if (!ctx) return
    const { n, cell_m, radius_km } = terrain.meta
    const R = radius_km * 1000
    const image = ctx.createImageData(PX, PX)
    const perPx = (2 * view.half) / PX
    // Light from azimuth 315°, 45° up.
    const lx = -0.5
    const ly = 0.5
    const lz = Math.SQRT1_2
    for (let py = 0; py < PX; py++) {
      const north = view.north + view.half - (py + 0.5) * perPx
      const row = Math.round((R - north) / cell_m)
      for (let px = 0; px < PX; px++) {
        const east = view.east - view.half + (px + 0.5) * perPx
        const col = Math.round((east + R) / cell_m)
        const i = (py * PX + px) * 4
        if (col < 1 || row < 1 || col > n - 2 || row > n - 2) continue
        const dx = (height(terrain, col + 1, row) - height(terrain, col - 1, row)) / (2 * cell_m)
        const dy = (height(terrain, col, row - 1) - height(terrain, col, row + 1)) / (2 * cell_m)
        const lit = Math.max(0, (-dx * lx - dy * ly + lz) / Math.hypot(dx, dy, 1))
        const v = dark ? 255 : 0
        let r = v
        let g = v
        let b = v
        let a = dark ? lit ** 2 * 0.42 : (1 - lit) ** 1.4 * 0.62
        const over = tintRef.current?.(col, row, px, py)
        if (over) {
          const k = over[3]
          r = r * a * (1 - k) + over[0] * k
          g = g * a * (1 - k) + over[1] * k
          b = b * a * (1 - k) + over[2] * k
          a = a * (1 - k) + k
          r /= a
          g /= a
          b /= a
        }
        image.data[i] = r
        image.data[i + 1] = g
        image.data[i + 2] = b
        image.data[i + 3] = a * 255
      }
    }
    ctx.putImageData(image, 0, 0)
  }, [terrain, view.east, view.north, view.half, dark, stamp])

  return (
    <div className="relative aspect-square w-full outline -outline-offset-1 outline-line">
      <canvas ref={ref} width={PX} height={PX} className="absolute inset-0 size-full" aria-hidden />
      <svg
        viewBox={`${view.east - view.half} ${-view.north - view.half} ${2 * view.half} ${2 * view.half}`}
        role="img"
        aria-label={label}
        className="absolute inset-0 size-full overflow-visible"
      >
        {children}
      </svg>
    </div>
  )
}

/** A scale bar in the bottom-left corner of a TerrainMap, in the map's own metres. */
export function ScaleBar({ view, metres }: { view: View; metres: number }) {
  const u = view.half / 100
  const x = view.east - view.half + 6 * u
  const y = -view.north + view.half - 6 * u
  return (
    <g>
      <path d={`M${x} ${y - 2 * u}V${y}H${x + metres}V${y - 2 * u}`} className="fill-none stroke-ink" strokeWidth={0.6 * u} />
      <text x={x + metres / 2} y={y - 3 * u} textAnchor="middle" className="fill-ink font-mono" fontSize={5.5 * u}>
        {metres >= 1000 ? `${metres / 1000} km` : `${metres} m`}
      </text>
    </g>
  )
}

export function Fig({ children }: { children: ReactNode }) {
  return <p className="max-w-[68ch] text-xs text-ink-faint text-pretty">{children}</p>
}
