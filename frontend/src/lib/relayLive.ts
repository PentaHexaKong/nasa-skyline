import { useHydrated } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { Span } from './mission'
import { relaySite, SERVICE_SITE, scientificUnavailableReason } from './missionScience'
import { postScience } from './scienceRequest'

/** The comparison's longest window; longer stays are computed over their first 28 days. */
export const RELAY_MAX_S = 28 * 86400
export const RELAY_SATELLITES = 4

export type RelayTier = 'verified-replay' | 'propagated-two-body'

/** Contact over the stay with `relays` relay satellites (0 = direct to Earth only). */
export type RelayStep = { relays: number; share: number; longestSilenceS: number; gain: number }

export type RelayLadder = {
  tier: RelayTier
  cadenceS: number
  startUtc: string
  durationS: number
  /** The stay is longer than the comparison's window, so only its first part is computed. */
  truncated: boolean
  steps: RelayStep[]
  track: RelayTrack
}

/** The comparison sample by sample, for views that draw contact over time or the satellites in space. */
export type RelayTrack = {
  startMs: number
  cadenceS: number
  direct: boolean[]
  /** Per satellite: it sees the site and Earth at that sample. */
  relayed: boolean[][]
  /** Per satellite, per sample, km from the Moon's centre in MOON_ME_DE421. Absent from adapters that predate positions. */
  relayKm?: number[][][]
  earthKm?: number[][]
}

/** `retryable`: the service failed to answer, so asking again may work; a site it does not serve never will. */
export type RelayLoad =
  | { status: 'loading' }
  | { status: 'ready'; ladder: RelayLadder }
  | { status: 'unavailable'; message: string; retryable?: boolean }

const vector = z.tuple([z.number(), z.number(), z.number()])
const reply = z.object({
  dataState: z.literal('computed'),
  tier: z.enum(['verified-replay', 'propagated-two-body']),
  cadenceS: z.number().int().positive(),
  relayScience: z.object({
    result: z.object({
      directAvailable: z.array(z.boolean()),
      siteRelayAvailable: z.array(z.array(z.boolean())),
      relayEarthAvailable: z.array(z.array(z.boolean())),
      relayPositionKm: z.array(z.array(vector)).optional(),
      earthPositionKm: z.array(vector).optional(),
    }),
    provenance: z.object({ sampleUtc: z.array(z.string()).min(1) }),
  }),
})

const longestRun = (open: boolean[]) => {
  let best = 0
  let run = 0
  for (const on of open) {
    run = on ? 0 : run + 1
    best = Math.max(best, run)
  }
  return best
}

/**
 * Contact for 0 to n relays from one comparison. A sample has contact when Earth is in view directly, or when one of the
 * first k satellites sees both the site and Earth at that moment. The satellites nest (k includes k - 1), so each step's
 * gain is what that one added satellite buys.
 */
export function relaySteps(direct: boolean[], siteLeg: boolean[][], earthLeg: boolean[][], cadenceS: number): RelayStep[] {
  const open = [...direct]
  const steps: RelayStep[] = []
  for (let k = 0; k <= siteLeg.length; k++) {
    if (k > 0) {
      const site = siteLeg[k - 1] ?? []
      const earth = earthLeg[k - 1] ?? []
      for (let t = 0; t < open.length; t++) if (site[t] && earth[t]) open[t] = true
    }
    const share = open.length ? open.filter(Boolean).length / open.length : 0
    steps.push({ relays: k, share, longestSilenceS: longestRun(open) * cadenceS, gain: k === 0 ? 0 : share - (steps[k - 1]?.share ?? 0) })
  }
  return steps
}

/** The fewest relays after which one more adds under half a percentage point of the stay. */
export function suggestedRelays(steps: RelayStep[]) {
  for (const step of steps) {
    const next = steps[step.relays + 1]
    if (!next || next.gain < 0.005) return step.relays
  }
  return steps.length - 1
}

/** Contact with the first `relays` satellites as time spans: direct, or through any of them. */
export function contactSpans(track: RelayTrack, relays: number): Span[] {
  const cadenceMs = track.cadenceS * 1000
  const spans: Span[] = []
  let from: number | undefined
  for (let t = 0; t <= track.direct.length; t++) {
    const open = t < track.direct.length && (track.direct[t] || track.relayed.slice(0, relays).some((r) => r[t]))
    if (open && from === undefined) from = t
    if (!open && from !== undefined) {
      spans.push([track.startMs + from * cadenceMs, track.startMs + t * cadenceMs])
      from = undefined
    }
  }
  return spans
}

/** Turns a comparison reply into the ladder and its sample track, or says why it cannot. */
export function readRelayReply(body: unknown, stayS: number): RelayLoad {
  const parsed = reply.safeParse(body)
  if (!parsed.success) {
    const message = (body as { error?: { message?: string } } | null)?.error?.message
    return { status: 'unavailable', message: message ?? 'The relay comparison returned no result for this stay.' }
  }
  const { tier, cadenceS, relayScience } = parsed.data
  const { directAvailable, siteRelayAvailable, relayEarthAvailable, relayPositionKm, earthPositionKm } = relayScience.result
  const startUtc = relayScience.provenance.sampleUtc[0] ?? ''
  return {
    status: 'ready',
    ladder: {
      tier,
      cadenceS,
      startUtc,
      durationS: directAvailable.length * cadenceS,
      truncated: stayS > RELAY_MAX_S,
      steps: relaySteps(directAvailable, siteRelayAvailable, relayEarthAvailable, cadenceS),
      track: {
        startMs: Date.parse(startUtc),
        cadenceS,
        direct: directAvailable,
        relayed: siteRelayAvailable.map((site, k) => site.map((on, t) => on && Boolean(relayEarthAvailable[k]?.[t]))),
        relayKm: relayPositionKm,
        earthKm: earthPositionKm,
      },
    },
  }
}

/** Asks the relay comparison once per site, window and `attempt` (bump it to ask again); a result for an older ask is dropped. */
export function useRelayLadder(siteId: string, startMs: number, stayS: number, attempt = 0): RelayLoad {
  const [load, setLoad] = useState<RelayLoad>({ status: 'loading' })
  // Before hydration the planner renders its default plan; asking for it would hold the one-at-a-time service.
  const hydrated = useHydrated()
  useEffect(() => {
    if (!hydrated) return
    const site = relaySite(siteId)
    if (!site) {
      setLoad({
        status: 'unavailable',
        message: SERVICE_SITE[siteId]
          ? 'The relay comparison has no orbit for this site’s position and dates yet.'
          : scientificUnavailableReason(siteId),
      })
      return
    }
    const durationS = Math.min(stayS, RELAY_MAX_S)
    let current = true
    setLoad({ status: 'loading' })
    postScience('/relay-engineering/compare', {
      siteId: site,
      startUtc: new Date(startMs).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      durationS,
      satellites: RELAY_SATELLITES,
    })
      .then((body) => {
        if (current) setLoad(readRelayReply(body, stayS))
      })
      .catch((error: unknown) => {
        if (current)
          setLoad({
            status: 'unavailable',
            message: error instanceof Error ? error.message : 'The relay comparison could not be reached.',
            retryable: true,
          })
      })
    return () => {
      current = false
    }
  }, [hydrated, siteId, startMs, stayS, attempt])
  return load
}
