import { expect, test } from 'vitest'
import { z } from 'zod'
import requestSchema from '../../../contracts/proposals/roverRequest.schema.json'
import responseSchema from '../../../contracts/proposals/roverResponse.schema.json'
import request from '../../../examples/roverRequest.proposed.json'
import response from '../../../examples/roverResponse.computed.json'
import type { RoverRequest, RoverResponse } from './roverContract.proposed'

const parsedRequest: RoverRequest = request as RoverRequest
const parsedResponse: RoverResponse = response as RoverResponse
const validateResponse = z.fromJSONSchema(responseSchema as Parameters<typeof z.fromJSONSchema>[0])

test('proposed rover schemas accept authoritative real data with canonical units', () => {
  expect(z.fromJSONSchema(requestSchema as Parameters<typeof z.fromJSONSchema>[0]).safeParse(parsedRequest).success).toBe(true)
  expect(validateResponse.safeParse(parsedResponse).success).toBe(true)
  expect(response.contractStatus).toBe('proposed-for-team-review')
  expect(response.units).toMatchObject({ angles: 'deg', distances: 'm', durations: 's', fractions: 'fraction' })
  expect(response.result.grid.frame).toBe('MOON_ME_DE421')
  expect(response.result.grid.terrainValidMask).toHaveLength(3)
  expect(response.result.directOnly.reachableMask.flat().filter(Boolean)).toHaveLength(4)
  expect(response.provenance.operationalSafetyValidated).toBe(false)
})

test('uncomputed relay retains explicit null arrays and sampled time semantics', () => {
  expect(response.result.relayAssisted.dataState).toBe('not_computed')
  expect(response.result.relayAssisted.reachableMask).toBeNull()
  expect(response.result.timeGrid.endpointIncluded).toBe(true)
  expect(response.result.directOnly.reachedAtTimeMask).toHaveLength(response.result.timeGrid.timestampsUtc.length)
  const invalid = structuredClone(response)
  invalid.units.durations = 'hours'
  expect(validateResponse.safeParse(invalid).success).toBe(false)
})
