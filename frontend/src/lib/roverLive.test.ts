import { describe, expect, it } from 'vitest'
import cannotStart from '../../fixtures/rover/cr1-2026-11-20T12-cannot-start.json'
import reach from '../../fixtures/rover/cr1-2026-11-27T12.json'
import type { RoverResponse } from './roverContract.proposed'
import { parseRoverReach, roverRequest } from './roverLive'

describe('roverRequest', () => {
  it('asks for the 3 by 3 grid from the landing moment, on a 2-minute grid relative to the requested landing', () => {
    const body = roverRequest('connecting-ridge', Date.parse('2026-11-27T12:03:41Z'))
    expect(body).toMatchObject({
      site: 'CR1',
      startUtc: '2026-11-27T12:03:41Z',
      durationS: 7200,
      timeStepS: 120,
      gridRadiusCells: 1,
      gridResolutionM: 80,
      speedMps: 0.2,
      maximumSlopeDeg: 20,
      communicationMode: 'direct-only',
    })
  })

  it('has no request for a place outside the study sites', () => {
    expect(roverRequest('apollo-11', 0)).toBeNull()
    expect(roverRequest('apollo11', 0)).toBeNull()
    expect(roverRequest('shackleton-ridge', 0)).toBeNull()
  })
})

describe('parseRoverReach', () => {
  it('reads the service reply for Connecting Ridge on 27 November 2026', () => {
    const out = parseRoverReach(reach as unknown as RoverResponse)
    expect(out?.kind).toBe('reach')
    if (out?.kind !== 'reach') return
    expect(out.reached).toBe(5)
    expect(out.cells.map((c) => (c.kind === 'reached' ? c.arrivalS : c.kind))).toEqual([
      960,
      480,
      960,
      480,
      'landing',
      480,
      'not-reached',
      'not-reached',
      'not-reached',
    ])
  })

  it('says the rover cannot set off when the landing cell fails the rules at landing', () => {
    expect(parseRoverReach(cannotStart as unknown as RoverResponse)).toEqual({ kind: 'cannot-start' })
  })

  it('has no reach for a failed reply', () => {
    const failed = { dataState: 'unavailable', result: null, error: { code: 'rover_unavailable', message: 'down' } }
    expect(parseRoverReach(failed as unknown as RoverResponse)).toBeNull()
  })
})
