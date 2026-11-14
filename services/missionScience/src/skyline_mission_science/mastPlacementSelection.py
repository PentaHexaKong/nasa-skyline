from .optimization import nondominated


objectiveDefinitions = [
    dict(
        metric='directEarthAvailabilityFraction', direction='maximize', unit='fraction'
    ),
    dict(metric='sunlightAvailabilityFraction', direction='maximize', unit='fraction'),
    dict(metric='longestDirectEarthBlackoutS', direction='minimize', unit='s'),
    dict(metric='longestDarknessS', direction='minimize', unit='s'),
    dict(metric='cableDistanceM', direction='minimize', unit='m'),
    dict(metric='observerHeightM', direction='minimize', unit='m'),
]


def placementViolations(request, cableDistanceM, estimatedSlopeDeg, metrics=None):
    violations = []
    if cableDistanceM > request.maximumCableLengthM:
        violations.append('maximum_cable_length')
    if (
        request.maximumSlopeDeg is not None
        and estimatedSlopeDeg is not None
        and estimatedSlopeDeg > request.maximumSlopeDeg
    ):
        violations.append('maximum_DEM_scale_slope')
    if metrics is not None:
        constraints = request.constraints
        comparisons = [
            (
                metrics.sunlightAvailabilityFraction < constraints.minimumSolar,
                'minimum_sunlight',
            ),
            (
                metrics.directEarthAvailabilityFraction < constraints.minimumEarth,
                'minimum_direct_Earth',
            ),
            (
                metrics.longestDarkness.durationS > constraints.maximumSolarOutageS,
                'maximum_darkness',
            ),
            (
                metrics.longestDirectEarthBlackout.durationS
                > constraints.maximumEarthOutageS,
                'maximum_direct_Earth_blackout',
            ),
        ]
        violations.extend(name for violated, name in comparisons if violated)
    return violations


def placementRanks(candidates):
    eligible = []
    for candidate in candidates:
        for outcome in candidate.outcomes:
            if outcome.feasibilityStatus == 'feasible' and outcome.metrics is not None:
                metrics = outcome.metrics
                vector = [
                    -metrics.directEarthAvailabilityFraction,
                    -metrics.sunlightAvailabilityFraction,
                    metrics.longestDirectEarthBlackout.durationS,
                    metrics.longestDarkness.durationS,
                    candidate.cableDistanceM,
                    outcome.observerHeightM,
                ]
                eligible.append(
                    ((candidate.candidateId, outcome.observerHeightM), vector)
                )
    ranks = {}
    rank = 0
    while eligible:
        front = set(nondominated([vector for _, vector in eligible]))
        for index in sorted(front):
            ranks[eligible[index][0]] = rank
        eligible = [item for index, item in enumerate(eligible) if index not in front]
        rank += 1
    return ranks
