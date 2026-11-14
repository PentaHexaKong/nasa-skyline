import { useEffect, useMemo, useRef, useState } from 'react'
import { afterGlide } from '~/components/moonBridge'
import type { Summary, Terrain, Track } from '~/lib/data'
import { loadTerrain } from '~/lib/data'
import { clearShare, downsample, extremes, lineOfSight, nearest, relief, type Spot } from '~/lib/landscape'
import { longDate, minuteLabel } from '~/lib/time'
import { useTracks } from '~/lib/useTracks'

export type LandscapeMode = 'ground' | 'sun' | 'earth'

/** Where the Sun and Earth stand at the moment the landscape is lit for, from the pipeline's tracks. */
export type Moment = { date: string; minute: number; sun: { az: number; el: number }; earth: { az: number; el: number } | null }

/**
 * The lowest Sun of the first lunar month that still reaches the site: long shadows, so the tile shows light and shadow
 * side by side. Earth is read at the same hour from the hourly Earth track.
 */
export function pickMoment(tracks: Record<string, Track>): Moment | null {
  let best: Moment | null = null
  for (const date of Object.keys(tracks).sort().slice(0, 30)) {
    const tr = tracks[date]
    if (!tr) continue
    tr.t_min.forEach((t, i) => {
      const el = tr.el_deg[i] ?? -90
      const lit = (tr.direct_fraction[i] ?? 0) > 0.5
      if (!lit || el < 0.3 || t % 60 !== 0) return
      if (best && el >= best.sun.el) return
      const e = tr.earth?.t_min.indexOf(t) ?? -1
      const earth = tr.earth && e >= 0 ? { az: tr.earth.az_deg[e] ?? 0, el: tr.earth.el_deg[e] ?? 0 } : null
      best = { date, minute: t, sun: { az: tr.az_deg[i] ?? 0, el }, earth }
    })
  }
  return best
}

type Layers = {
  ground: ImageData
  sun: ImageData
  earth: ImageData | null
  pins: Record<LandscapeMode, { spot: Spot; label: string }[]>
  sunShare: number
  earthShare: number | null
  n: number
  /** The tile's width, km, from the terrain's metadata. */
  km: number
}

const NEUTRAL: [number, number] = [315, 35] // a reading light from the north-west, for the shape only

function paint(t: Terrain, m: Moment): Layers {
  const n = t.meta.n
  const coarse = downsample(t, 2)
  const cn = coarse.meta.n
  // Bilinear between the coarse cells, so shadow edges come out soft instead of in 2-cell steps.
  const up = (mask: Uint8Array) => (r: number, c: number) => {
    const y = Math.min(cn - 1.001, r / 2)
    const x = Math.min(cn - 1.001, c / 2)
    const y0 = Math.floor(y)
    const x0 = Math.floor(x)
    const fy = y - y0
    const fx = x - x0
    const at = (yy: number, xx: number) => mask[yy * cn + xx] ?? 0
    const top = at(y0, x0) * (1 - fx) + at(y0, x0 + 1) * fx
    const bottom = at(y0 + 1, x0) * (1 - fx) + at(y0 + 1, x0 + 1) * fx
    return top * (1 - fy) + bottom * fy
  }
  const shape = relief(t, ...NEUTRAL)
  const sunShade = relief(t, m.sun.az, Math.max(0.5, m.sun.el))
  const sunMask = lineOfSight(coarse, m.sun.az, m.sun.el)
  const earthMask = m.earth ? lineOfSight(coarse, m.earth.az, m.earth.el) : null
  const sunAt = up(sunMask)
  const earthAt = earthMask ? up(earthMask) : null
  const ground = new ImageData(n, n)
  const sun = new ImageData(n, n)
  const earth = earthAt ? new ImageData(n, n) : null
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++) {
      const i = r * n + c
      const g = 40 + 190 * (shape[i] ?? 0)
      ground.data.set([g, g, g, 255], i * 4)
      // Sunlit ground in the Sun's warm grey; terrain shadow nearly black, so light and shadow read without colour too.
      const lit = sunAt(r, c)
      const s = 70 + 185 * (sunShade[i] ?? 0)
      sun.data.set([10 + (s - 10) * lit, 10 + (s * 0.93 - 10) * lit, 12 + (s * 0.8 - 12) * lit, 255], i * 4)
      if (earth && earthAt) {
        const seen = earthAt(r, c)
        const e = 30 + 120 * (shape[i] ?? 0)
        earth.data.set([e * 0.55, e * 0.55 + (e * 0.4 + 40) * seen, e * 0.6 + (e * 0.4 + 70) * seen, 255], i * 4)
      }
    }
  const { high, low, site } = extremes(t)
  const rel = (h: number) => `${h >= site.height ? '+' : '−'}${Math.round(Math.abs(h - site.height))} m`
  const scale = (s: Spot | null) => s && { ...s, row: s.row * 2, col: s.col * 2 }
  const shadow = scale(nearest(sunMask, cn, 0, 6))
  const bright = scale(nearest(sunMask, cn, 1, 6))
  const hidden = earthMask ? scale(nearest(earthMask, cn, 0, 6)) : null
  const seen = earthMask ? scale(nearest(earthMask, cn, 1, 6)) : null
  return {
    ground,
    sun,
    earth,
    n,
    km: 2 * t.meta.radius_km,
    sunShare: clearShare(sunMask),
    earthShare: earthMask ? clearShare(earthMask) : null,
    pins: {
      ground: [
        { spot: high, label: `Higher ground · ${rel(high.height)}` },
        { spot: low, label: `Lower ground · ${rel(low.height)}` },
      ],
      sun: [
        ...(shadow ? [{ spot: shadow, label: 'In shadow at this moment' }] : []),
        ...(bright ? [{ spot: bright, label: 'In sunlight at this moment' }] : []),
      ],
      earth: [
        ...(seen ? [{ spot: seen, label: 'Earth in view' }] : []),
        ...(hidden ? [{ spot: hidden, label: 'Earth behind terrain' }] : []),
      ],
    },
  }
}

/**
 * The site's real terrain, tilted into a landscape that fills the screen. The parent sets `--p` from scroll, which
 * pushes the camera in (`.zoom-in`) and slides the ground (`.parallax`).
 */
export function Landscape({
  site,
  mode,
  onMoment,
}: {
  site: Summary
  mode: LandscapeMode
  onMoment?: (m: Moment, l: Pick<Layers, 'sunShare' | 'earthShare' | 'km'>) => void
}) {
  const tracks = useTracks(site.site.id)
  const [terrain, setTerrain] = useState<Terrain>()
  const [layers, setLayers] = useState<Layers>()
  const canvas = useRef<HTMLCanvasElement>(null)
  const moment = useMemo(() => (tracks ? pickMoment(tracks) : null), [tracks])

  useEffect(() => {
    let live = true
    loadTerrain(site.site.id).then((t) => live && setTerrain(t))
    return () => {
      live = false
    }
  }, [site.site.id])

  useEffect(() => {
    if (!terrain || !moment) return
    // One frame after the page has painted, and after the Moon arriving from the front door has settled, so the trace
    // never holds up the first scroll or the Moon's glide.
    return afterGlide(() => {
      const l = paint(terrain, moment)
      setLayers(l)
      onMoment?.(moment, l)
    })
  }, [terrain, moment, onMoment])

  useEffect(() => {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx || !layers) return
    const img = mode === 'sun' ? layers.sun : mode === 'earth' ? (layers.earth ?? layers.ground) : layers.ground
    ctx.putImageData(img, 0, 0)
  }, [layers, mode])

  const pins = layers?.pins[mode] ?? []
  return (
    <div aria-hidden className="absolute inset-0 overflow-hidden bg-black perspective-[1100px]">
      <div className="zoom-in absolute inset-0 origin-[50%_70%] transform-3d [--zoom:0.3]">
        <div className="parallax absolute inset-0 transform-3d [--depth:-140px]">
          <div className="absolute top-[62%] left-1/2 aspect-square w-[118%] -translate-1/2 transform-3d transform-[rotateX(58deg)] max-lg:w-[230%]">
            <canvas
              ref={canvas}
              width={layers?.n ?? 1}
              height={layers?.n ?? 1}
              className={`h-full w-full [mask-image:linear-gradient(to_bottom,transparent_0%,#000_22%)] transition-opacity duration-700 ${layers ? 'opacity-100' : 'opacity-0'}`}
            />
            {pins.map((p) => (
              <span
                key={p.label}
                className="absolute -translate-x-1/2 -translate-y-full origin-[50%_100%] transform-[rotateX(-58deg)]"
                style={{ left: `${(p.spot.col / (layers?.n ?? 1)) * 100}%`, top: `${(p.spot.row / (layers?.n ?? 1)) * 100}%` }}
              >
                <span className="flex flex-col items-center gap-1">
                  <span className="rounded-full border border-white/25 bg-black/80 px-3 py-1 text-sm whitespace-nowrap text-white">
                    {p.label}
                  </span>
                  <span className="h-5 w-px bg-white/70" />
                  <span className="size-1.5 rounded-full bg-white" />
                </span>
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,transparent_30%,#000_85%)]" />
    </div>
  )
}

export const momentLabel = (m: Moment) => `${longDate(m.date)}, ${minuteLabel(m.minute)} UTC`
