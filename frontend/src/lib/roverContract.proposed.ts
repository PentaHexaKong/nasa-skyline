// Proposed for team review. Generated from the isolated rover prototype.

export type RoverRequest = {
  schemaVersion?: 'skyline-rover-request/0.1.0'
  site?: string
  startUtc: string
  durationS?: number
  timeStepS?: number
  terrainDemId?: 'LDEM_80S_80MPP_ADJ.TIF'
  projectionId?: 'LOLA-south-polar-stereographic-DE421'
  gridRadiusCells?: 0 | 1
  gridResolutionM?: number
  observerHeightM?: number
  speedMps: number
  maximumSlopeDeg: number
  movementRule?: 'four-neighbor-no-diagonals'
  allowWaiting?: boolean
  movementRequiresSunlight?: boolean
  movementRequiresCommunication?: boolean
  stoppingRequiresSunlight?: boolean
  stoppingRequiresCommunication?: boolean
  solarDefinition?: 'anyDisk' | 'center' | 'fullDisk'
  profile?: 'geometric'
  horizonOffsetDeg?: 0
  communicationMode?: 'direct-only' | 'relay-assisted'
  budget?: RoverBudget
}

export type RoverResponse = RoverComputed | RoverFailure

export type RoverBudget = {
  maxGeometryEvaluations: number
  maxGraphNodes: number
  maxTransitions: number
  maxWallTimeS: number
}

export type ContractError = {
  code: string
  message: string
}

export type RoverComputed = {
  schemaVersion: 'skyline-rover-response/0.1.0'
  contractStatus: 'proposed-for-team-review'
  dataState: 'computed'
  scenarioId: string
  request: RoverRequest
  units: Units
  result: RoverResult
  provenance: Record<string, unknown>
  error: null
}

export type RoverEdge = {
  sourceCell: number
  targetCell: number
  midpointPoint: number
  traversable: boolean
  distanceM: number | null
  maximumSegmentGradeDeg: number | null
  reason: string | null
}

export type RoverFailure = {
  schemaVersion: 'skyline-rover-response/0.1.0'
  contractStatus: 'proposed-for-team-review'
  dataState: 'unsupported' | 'not_computed' | 'unavailable' | 'failed'
  scenarioId: null
  request: RoverRequest | null
  units: Units
  result: null
  provenance: null
  error: ContractError
  coverage: Record<string, unknown> | null
}

export type RoverGrid = {
  rows: number
  columns: number
  startCell: number
  frame: 'MOON_ME_DE421'
  projectionId: string
  projectionWkt: string
  projectedCellDimensionsM: Array<number>
  affineCornerTransform: Array<number>
  indexing: 'row-major; columns +projection X, rows -projection Y'
  terrainValidMask: Array<Array<boolean>>
  terrainTraversableMask: Array<Array<boolean>>
  points: Array<RoverPoint>
  cellPointIndices: Array<number>
  edges: Array<RoverEdge>
  dem: Record<string, unknown>
  referenceSite: Record<string, unknown>
  slopeProbeStepM: number
  slopeFootprintDiameterM: number
}

export type RoverPoint = {
  pointId: string
  latitudeDeg: number
  longitudeDegEast: number
  groundElevationM: number | null
  estimatedSlopeDeg: number | null
  terrainValid: boolean
  terrainReason: string | null
  surfacePositionM: Array<number> | null
  row: number | null
  column: number | null
  projectedXM: number
  projectedYM: number
}

export type RoverResult = {
  grid: RoverGrid
  timeGrid: RoverTimeGrid
  directOnly: RoverSection
  relayAssisted: RoverSection
  difference: Record<string, unknown>
  visibility: Record<string, unknown>
  requestedModeState: string
}

export type RoverSection = {
  dataState: 'computed' | 'unsupported' | 'not_computed' | 'unavailable' | 'failed'
  reason: string | null
  reachableMask: Array<Array<boolean | null>> | null
  earliestArrivalS: Array<Array<number | null>> | null
  earliestArrivalUtc: Array<Array<string | null>> | null
  reachedAtTimeMask: Array<Array<boolean>> | null
  reachableTimeLevelFraction: Array<Array<number | null>> | null
  waitingOpportunityBinMask: Array<Array<boolean>> | null
  arrivalAtEndBoundaryMask: Array<Array<boolean>> | null
  startAdmitted: boolean | null
  transitionsChecked: number | null
  communicationConstraintApplied: boolean | null
}

export type RoverTimeGrid = {
  nominalStartUtc: string
  elapsedS: Array<number>
  timestampsUtc: Array<string>
  endpointIncluded: true
  durationScale: 'elapsed SPICE ET seconds'
  timeLevelFractionDenominator: number
  waitingBins: 'half-open [start,end); sampled stopping opportunities'
}

export type Units = {
  angles: 'deg'
  distances: 'm'
  durations: 's'
  fractions: 'fraction'
  timestamps: 'UTC ISO 8601'
}
