import { useEffect, useState } from 'react'
import { loadTracks, type Track } from './data'

/** Sun tracks are ~20x the summary, so they load after first paint, in the browser only. */
export function useTracks(siteId: string) {
  const [tracks, setTracks] = useState<Record<string, Track>>()
  useEffect(() => {
    let live = true
    setTracks(undefined)
    loadTracks(siteId).then((t) => live && setTracks(t))
    return () => {
      live = false
    }
  }, [siteId])
  return tracks
}

/** Several consecutive days' Sun tracks as one, so a chart can draw the Sun's path across a whole lunar day. */
export function joinTracks(tracks: Record<string, Track>, dates: string[]): Track | undefined {
  const joined: Track = { t_min: [], az_deg: [], el_deg: [], direct_fraction: [] }
  dates.forEach((date, i) => {
    const tr = tracks[date]
    if (!tr) return
    joined.t_min.push(...tr.t_min.map((t) => t + i * 1440))
    joined.az_deg.push(...tr.az_deg)
    joined.el_deg.push(...tr.el_deg)
    joined.direct_fraction.push(...tr.direct_fraction)
  })
  return joined.t_min.length > 0 ? joined : undefined
}
