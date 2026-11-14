import math

import numpy as np

from .roverModels import RoverSection


class RoverBudgetExceeded(ValueError):
    pass


def timeExpandedReachability(
    grid,
    request,
    sunAvailable,
    communicationAvailable,
    timestampsUtc,
    checkBudget=lambda: None,
):
    levels = request.durationS // request.timeStepS + 1
    count = grid.rows * grid.columns
    if levels * count > request.budget.maxGraphNodes:
        raise RoverBudgetExceeded('Graph node budget exhausted')
    terrain = np.asarray(grid.terrainTraversableMask, dtype=bool).reshape(-1)

    def allowed(requireSun, requireCommunication):
        mask = np.ones((len(grid.points), levels), dtype=bool)
        if requireSun:
            if sunAvailable is None:
                raise ValueError('Required sunlight has no computed samples')
            samples = np.asarray(sunAvailable, dtype=bool)
            if samples.shape != mask.shape:
                raise ValueError('Sunlight sample dimensions disagree')
            mask &= samples
        if requireCommunication:
            if communicationAvailable is None:
                raise ValueError('Required communication has no computed samples')
            samples = np.asarray(communicationAvailable, dtype=bool)
            if samples.shape != mask.shape:
                raise ValueError('Communication sample dimensions disagree')
            mask &= samples
        return mask

    movement = allowed(
        request.movementRequiresSunlight, request.movementRequiresCommunication
    )
    stopping = allowed(
        request.stoppingRequiresSunlight, request.stoppingRequiresCommunication
    )
    if movement.shape != (len(grid.points), levels) or stopping.shape != movement.shape:
        raise ValueError('Visibility grids must match spatial points and time levels')
    outgoing = [[] for _ in range(count)]
    for edge in grid.edges:
        if not edge.traversable:
            continue
        if (
            edge.distanceM is None
            or not math.isfinite(edge.distanceM)
            or edge.distanceM <= 0
        ):
            raise ValueError('Traversable edges require positive finite distance')
        if edge.distanceM > request.speedMps * request.durationS:
            continue
        durationSteps = max(
            1, math.ceil(edge.distanceM / request.speedMps / request.timeStepS)
        )
        if durationSteps * request.timeStepS * request.speedMps < edge.distanceM:
            durationSteps += 1
        feasible = (
            movement[grid.cellPointIndices[edge.sourceCell]]
            & movement[edge.midpointPoint]
            & movement[grid.cellPointIndices[edge.targetCell]]
        )
        badPrefix = np.concatenate([[0], np.cumsum(~feasible)])
        outgoing[edge.sourceCell].append((edge.targetCell, durationSteps, badPrefix))
        outgoing[edge.targetCell].append((edge.sourceCell, durationSteps, badPrefix))
    reached = np.zeros((levels, count), dtype=bool)
    start = grid.startCell
    reached[0, start] = terrain[start] and stopping[grid.cellPointIndices[start], 0]
    waiting = np.zeros((levels - 1, count), dtype=bool)
    checked = 0
    for timeIndex in range(levels):
        checkBudget()
        for cell in np.flatnonzero(reached[timeIndex]):
            point = grid.cellPointIndices[cell]
            if request.allowWaiting and timeIndex + 1 < levels:
                checked += 1
                if checked > request.budget.maxTransitions:
                    raise RoverBudgetExceeded('Graph transition budget exhausted')
                if stopping[point, timeIndex] and stopping[point, timeIndex + 1]:
                    reached[timeIndex + 1, cell] = True
                    waiting[timeIndex, cell] = True
            for target, steps, prefix in outgoing[cell]:
                checked += 1
                if checked > request.budget.maxTransitions:
                    raise RoverBudgetExceeded('Graph transition budget exhausted')
                arrival = timeIndex + steps
                if (
                    arrival < levels
                    and terrain[target]
                    and prefix[arrival + 1] - prefix[timeIndex] == 0
                ):
                    reached[arrival, target] = True
    mask, earliest, earliestUtc, share, boundary = [], [], [], [], []
    for cell in range(count):
        point = grid.points[grid.cellPointIndices[cell]]
        arrivals = np.flatnonzero(reached[:, cell])
        mask.append(bool(len(arrivals)) if point.terrainValid else None)
        earliest.append(
            float(arrivals[0] * request.timeStepS) if len(arrivals) else None
        )
        earliestUtc.append(timestampsUtc[arrivals[0]] if len(arrivals) else None)
        share.append(float(reached[:, cell].mean()) if point.terrainValid else None)
        boundary.append(bool(len(arrivals) and arrivals[0] == levels - 1))
    reshape = lambda values: [
        values[index : index + grid.columns]
        for index in range(0, len(values), grid.columns)
    ]
    return RoverSection(
        dataState='computed',
        reason=None
        if reached[0, start]
        else 'Start fails terrain traversability or initial stopping requirements',
        reachableMask=reshape(mask),
        earliestArrivalS=reshape(earliest),
        earliestArrivalUtc=reshape(earliestUtc),
        reachedAtTimeMask=reached.tolist(),
        reachableTimeLevelFraction=reshape(share),
        waitingOpportunityBinMask=waiting.tolist(),
        arrivalAtEndBoundaryMask=reshape(boundary),
        startAdmitted=bool(reached[0, start]),
        transitionsChecked=checked,
        communicationConstraintApplied=request.movementRequiresCommunication
        or request.stoppingRequiresCommunication,
    )
