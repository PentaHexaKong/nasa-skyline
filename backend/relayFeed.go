package main

import (
	"crypto/sha256"
	_ "embed"
	"encoding/json"
	"fmt"
	"math"
	"path/filepath"
	"reflect"
	"strings"
	"time"
)

//go:embed relayFeed.go
var relayFeedSource []byte

//go:embed relayEngineering.go
var relayEngineeringSource []byte

const relayFeedVersion = "skyline-relay-feed/1.0.0"
const relayFeedAlgorithm = "synchronized-relay-feed/1.0.0"

type sampleInterval struct {
	StartUTC     string `json:"startUtc"`
	EndUTC       string `json:"endUtc"`
	StartS       int    `json:"startS"`
	EndS         int    `json:"endS"`
	StartClipped bool   `json:"startClipped"`
	EndClipped   bool   `json:"endClipped"`
}

type sampleMetrics struct {
	Fraction                       float64          `json:"fraction"`
	AvailableDurationS             int              `json:"availableDurationS"`
	LongestBlackoutS               int              `json:"longestBlackoutS"`
	LongestBlackoutTouchesBoundary bool             `json:"longestBlackoutTouchesBoundary"`
	AvailableIntervals             []sampleInterval `json:"availableIntervals"`
	BlackoutIntervals              []sampleInterval `json:"blackoutIntervals"`
}

func deriveSampleMetrics(available []bool, start time.Time, cadenceS int) sampleMetrics {
	result := sampleMetrics{AvailableIntervals: []sampleInterval{}, BlackoutIntervals: []sampleInterval{}}
	durationS := len(available) * cadenceS
	for begin := 0; begin < len(available); {
		end := begin + 1
		for end < len(available) && available[end] == available[begin] {
			end++
		}
		interval := sampleInterval{
			StartUTC: start.Add(time.Duration(begin*cadenceS) * time.Second).Format(time.RFC3339),
			EndUTC:   start.Add(time.Duration(end*cadenceS) * time.Second).Format(time.RFC3339),
			StartS:   begin * cadenceS, EndS: end * cadenceS, StartClipped: begin == 0, EndClipped: end == len(available),
		}
		if available[begin] {
			result.AvailableIntervals = append(result.AvailableIntervals, interval)
			result.AvailableDurationS += interval.EndS - interval.StartS
		} else {
			result.BlackoutIntervals = append(result.BlackoutIntervals, interval)
			if interval.EndS-interval.StartS > result.LongestBlackoutS {
				result.LongestBlackoutS = interval.EndS - interval.StartS
				result.LongestBlackoutTouchesBoundary = interval.StartClipped || interval.EndClipped
			}
		}
		begin = end
	}
	result.Fraction = float64(result.AvailableDurationS) / float64(durationS)
	return result
}

func deriveSampleMetricsOnGrid(available []bool, boundariesUTC []string, cadenceS int) sampleMetrics {
	metrics := deriveSampleMetrics(available, time.Time{}, cadenceS)
	for index := range metrics.AvailableIntervals {
		interval := &metrics.AvailableIntervals[index]
		interval.StartUTC = boundariesUTC[interval.StartS/cadenceS]
		interval.EndUTC = boundariesUTC[interval.EndS/cadenceS]
	}
	for index := range metrics.BlackoutIntervals {
		interval := &metrics.BlackoutIntervals[index]
		interval.StartUTC = boundariesUTC[interval.StartS/cadenceS]
		interval.EndUTC = boundariesUTC[interval.EndS/cadenceS]
	}
	return metrics
}

func checkRelaySummary(raw json.RawMessage, metrics sampleMetrics) error {
	var saved struct {
		Fraction            float64     `json:"fraction"`
		MaximumBlackoutS    float64     `json:"maximumBlackoutS"`
		AvailableIntervalsS [][]float64 `json:"availableIntervalsS"`
		BlackoutIntervalsS  [][]float64 `json:"blackoutIntervalsS"`
	}
	if json.Unmarshal(raw, &saved) != nil {
		return fmt.Errorf("missing relay metrics")
	}
	spans := func(intervals []sampleInterval) [][]float64 {
		result := make([][]float64, 0, len(intervals))
		for _, interval := range intervals {
			result = append(result, []float64{float64(interval.StartS), float64(interval.EndS)})
		}
		return result
	}
	if math.Abs(saved.Fraction-metrics.Fraction) > 1e-12 ||
		saved.MaximumBlackoutS != float64(metrics.LongestBlackoutS) ||
		!reflect.DeepEqual(saved.AvailableIntervalsS, spans(metrics.AvailableIntervals)) ||
		!reflect.DeepEqual(saved.BlackoutIntervalsS, spans(metrics.BlackoutIntervals)) {
		return fmt.Errorf("relay aggregate metrics disagree with synchronized booleans")
	}
	return nil
}

func relayDynamicsMatchTier(tier, dynamics string) bool {
	if tier == relayTierVerified {
		return dynamics == "saved two-body states, no new propagation"
	}
	return strings.HasPrefix(dynamics, "Two-body Moon-centered propagation of the verified Candidate 2 orbital elements")
}

// The verified tier is valid across the whole saved replay. The propagated tier is valid only for the requested window.
func relayTrajectoryValidity(tier, windowStart, windowEnd string) (epoch, validStart, validEnd string) {
	if tier == relayTierVerified {
		return "2025-01-01T00:00:00Z", "2025-01-01T00:00:00Z", "2025-01-29T00:00:00Z"
	}
	return windowStart, windowStart, windowEnd
}

func relayLadderSource(tier string) string {
	if tier == relayTierVerified {
		return "Synchronized mission-science and pinned Candidate 2 replay"
	}
	return "Synchronized mission-science and propagated Candidate 2 elements"
}

func relayLimitations(tier string, cadenceS int) []string {
	if tier == relayTierVerified {
		return []string{"120-second sampled geometry with left-endpoint bin metrics", "Subcadence transitions and outages may be missed", "Interval edges are sample-bin boundaries", "Saved two-body trajectory replay within its pinned 2025 epoch only", "Spherical Moon occultation for relay-to-Earth", "Sampled terrain skyline for surface hops", "Earth-center geometric target; ground-station and operational RF models unavailable"}
	}
	return []string{
		fmt.Sprintf("%d-second sampled geometry with left-endpoint bin metrics", cadenceS),
		"Subcadence transitions and outages may be missed",
		"Interval edges are sample-bin boundaries",
		"Two-body propagation of the verified Candidate 2 elements, with no Earth third-body perturbation and no lunar gravity harmonics",
		"Propagation accuracy is unvalidated away from January 2025",
		"Spherical Moon occultation for relay-to-Earth",
		"Sampled terrain skyline for surface hops",
		"Earth-center geometric target; ground-station and operational RF models unavailable",
	}
}

func buildRelayFeed(query relayCompareRequest, cadenceS int, environmentBody, relayBody []byte) (map[string]any, error) {
	var environment comparisonEnvironment
	var relay comparisonRelay
	if json.Unmarshal(environmentBody, &environment) != nil || json.Unmarshal(relayBody, &relay) != nil {
		return nil, fmt.Errorf("malformed scientific response")
	}
	if err := validateRelayComparison(environment, relay, cadenceS); err != nil {
		return nil, err
	}
	var source struct {
		Provenance struct {
			Request struct {
				SiteID         string `json:"siteId"`
				StartUTC       string `json:"startUtc"`
				DurationS      int    `json:"durationS"`
				CandidateID    string `json:"candidateId"`
				CadenceS       int    `json:"cadenceS"`
				Profile        string `json:"profile"`
				TerrainProfile string `json:"terrainProfile"`
				RFQualified    bool   `json:"rfQualified"`
			} `json:"request"`
			Site                map[string]any    `json:"site"`
			Implementation      map[string]string `json:"implementation"`
			TerrainConfig       map[string]any    `json:"terrainConfig"`
			Dynamics            string            `json:"dynamics"`
			ObserverHeightM     float64           `json:"observerHeightM"`
			MinimumElevationDeg float64           `json:"minimumElevationDeg"`
			EarthDefinition     string            `json:"earthDefinition"`
			RFQualified         bool              `json:"rfQualified"`
		} `json:"provenance"`
	}
	var env struct {
		Provenance struct {
			Request struct {
				Site             string  `json:"site"`
				StartUTC         string  `json:"startUtc"`
				DurationS        float64 `json:"durationS"`
				CadenceS         float64 `json:"cadenceS"`
				Profile          string  `json:"profile"`
				EarthDefinition  string  `json:"earthDefinition"`
				HorizonOffsetDeg float64 `json:"horizonOffsetDeg"`
				LocalResolutionM int     `json:"localResolutionM"`
			} `json:"request"`
			Version        string          `json:"version"`
			EpochET        float64         `json:"epochEt"`
			Implementation json.RawMessage `json:"implementation"`
			CacheKey       string          `json:"cacheKey"`
			Terrain        struct {
				Config           map[string]any `json:"config"`
				GroundHeightM    float64        `json:"groundHeightM"`
				RadialReferenceM float64        `json:"radialReferenceM"`
				SitePositionM    []float64      `json:"sitePositionM"`
			} `json:"terrain"`
			ResolvedSite map[string]any `json:"resolvedSite"`
		} `json:"provenance"`
	}
	if json.Unmarshal(relayBody, &source) != nil || json.Unmarshal(environmentBody, &env) != nil {
		return nil, fmt.Errorf("invalid provenance")
	}
	start, err := time.Parse(time.RFC3339, query.StartUTC)
	_, zoneOffsetS := start.Zone()
	if err != nil || zoneOffsetS != 0 || start.Nanosecond() != 0 {
		return nil, fmt.Errorf("UTC grid epoch required")
	}
	offset := int(start.Sub(relayOrigin).Seconds())
	satellites := query.satelliteCount()
	if cadenceS <= 0 ||
		cadenceS%relayBaseCadenceS != 0 ||
		query.DurationS <= 0 ||
		query.DurationS > relayMaxWindowS ||
		query.DurationS%cadenceS != 0 ||
		query.DurationS/cadenceS > relayMaxSamples ||
		offset%cadenceS != 0 ||
		satellites < 1 ||
		satellites > relayMaxSats ||
		(query.SiteID != "CR1" && query.SiteID != "GR1" && query.SiteID != "SR1") {
		return nil, fmt.Errorf("unsupported relay scenario")
	}
	tier := relay.Provenance.Tier
	verifiedWindow := offset >= 0 && offset+query.DurationS <= 28*86400 && satellites == relayDefaultSats && cadenceS == relayBaseCadenceS
	if (tier != relayTierVerified && tier != relayTierPropagated) ||
		(tier == relayTierVerified) != verifiedWindow ||
		relay.Provenance.Satellites != satellites {
		return nil, fmt.Errorf("relay tier mismatch")
	}
	request := source.Provenance.Request
	missionRequest := env.Provenance.Request
	relayEpoch, relayErr := time.Parse(time.RFC3339, request.StartUTC)
	missionEpoch, missionErr := time.Parse(time.RFC3339Nano, missionRequest.StartUTC)
	if len(relay.Provenance.SampleUTC) != len(relay.Result.TimesS) || relay.Provenance.EpochET == 0 || env.Provenance.EpochET == 0 {
		return nil, fmt.Errorf("missing absolute replay clock")
	}
	replayStart, clockErr := time.Parse(time.RFC3339Nano, relay.Provenance.SampleUTC[0])
	epochDifferenceS := math.Abs(relay.Provenance.EpochET - env.Provenance.EpochET)
	if clockErr != nil || epochDifferenceS > 1e-6 {
		return nil, fmt.Errorf("absolute ET epoch mismatch")
	}
	boundariesUTC := append(append([]string{}, relay.Provenance.SampleUTC...), relay.Provenance.EndUTC)
	for index, label := range boundariesUTC {
		stamp, err := time.Parse(time.RFC3339Nano, label)
		if err != nil || math.Abs(stamp.Sub(replayStart).Seconds()-float64(index*cadenceS)) > 0.001 {
			return nil, fmt.Errorf("invalid SPICE UTC sample grid")
		}
	}
	if relayErr != nil ||
		missionErr != nil ||
		!start.Equal(relayEpoch) ||
		missionEpoch.Format(time.RFC3339Nano) != replayStart.Format(time.RFC3339Nano) ||
		request.SiteID != query.SiteID ||
		missionRequest.Site != query.SiteID ||
		request.DurationS != query.DurationS ||
		missionRequest.DurationS != float64(query.DurationS) ||
		request.CadenceS != cadenceS ||
		missionRequest.CadenceS != float64(cadenceS) ||
		request.CandidateID != "nominal-candidate-2" ||
		request.Profile != "geometric" ||
		missionRequest.Profile != "geometric" ||
		request.TerrainProfile != "lola-80-240-zero-mask" ||
		missionRequest.EarthDefinition != "center" ||
		missionRequest.HorizonOffsetDeg != 0 ||
		missionRequest.LocalResolutionM != 80 ||
		request.RFQualified ||
		source.Provenance.RFQualified ||
		source.Provenance.ObserverHeightM != 0 ||
		source.Provenance.MinimumElevationDeg != 0 ||
		source.Provenance.EarthDefinition != "center" {
		return nil, fmt.Errorf("request and scientific profile mismatch")
	}
	if len(relay.Result.TimesS)*cadenceS != query.DurationS ||
		len(relay.Result.ViaRelayAvailable) != len(relay.Result.TimesS) ||
		len(relay.Result.SiteRelayAvailable) != satellites ||
		len(relay.Result.RelayEarthAvailable) != satellites {
		return nil, fmt.Errorf("missing communication-hop arrays")
	}
	for satellite := 0; satellite < satellites; satellite++ {
		if len(relay.Result.SiteRelayAvailable[satellite]) != len(relay.Result.TimesS) || len(relay.Result.RelayEarthAvailable[satellite]) != len(relay.Result.TimesS) {
			return nil, fmt.Errorf("communication-hop shape mismatch")
		}
	}
	for index := range relay.Result.TimesS {
		via := false
		for satellite := 0; satellite < satellites; satellite++ {
			via = via || (relay.Result.SiteRelayAvailable[satellite][index] && relay.Result.RelayEarthAvailable[satellite][index])
		}
		if via != relay.Result.ViaRelayAvailable[index] || relay.Result.AssistedAvailable[index] != (relay.Result.DirectAvailable[index] || via) {
			return nil, fmt.Errorf("simultaneous communication-hop mismatch at sample %d", index)
		}
	}
	if !reflect.DeepEqual(source.Provenance.TerrainConfig, env.Provenance.Terrain.Config) ||
		source.Provenance.TerrainConfig["observerHeightM"] != float64(0) ||
		source.Provenance.Site["siteId"] != query.SiteID ||
		env.Provenance.ResolvedSite["siteId"] != query.SiteID {
		return nil, fmt.Errorf("observer or terrain configuration mismatch")
	}
	for _, key := range []string{"sourceFrame", "sourceUrl"} {
		if source.Provenance.Site[key] == nil || source.Provenance.Site[key] != env.Provenance.ResolvedSite[key] {
			return nil, fmt.Errorf("coordinate provenance mismatch")
		}
	}
	relayLatitude, latitudeOK := source.Provenance.Site["latitudeDeg"].(float64)
	missionLatitude, missionLatitudeOK := env.Provenance.ResolvedSite["latitudeDeg"].(float64)
	relayLongitude, longitudeOK := source.Provenance.Site["longitudeDeg"].(float64)
	missionLongitude, missionLongitudeOK := env.Provenance.ResolvedSite["longitudeDeg"].(float64)
	if !latitudeOK ||
		!missionLatitudeOK ||
		!longitudeOK ||
		!missionLongitudeOK ||
		math.Abs(relayLatitude-missionLatitude) > 1e-9 ||
		math.Abs(math.Remainder(relayLongitude-missionLongitude, 360)) > 1e-9 {
		return nil, fmt.Errorf("coordinate provenance mismatch")
	}

	trajectoryPath, trajectoryHash := "", ""
	for path, hash := range relay.Provenance.Sources {
		if filepath.Base(strings.ReplaceAll(path, "\\", "/")) == "candidate2States.csv" {
			trajectoryPath, trajectoryHash = path, hash
		}
	}
	if trajectoryHash != "0f328f101228015d55ad301c512ffec27091beb02adb3649d3276669b1f54bce" ||
		!relayDynamicsMatchTier(tier, source.Provenance.Dynamics) ||
		len(source.Provenance.Implementation) == 0 ||
		len(env.Provenance.Implementation) == 0 ||
		env.Provenance.CacheKey == "" {
		return nil, fmt.Errorf("missing verified trajectory or implementation identity")
	}
	direct := deriveSampleMetricsOnGrid(relay.Result.DirectAvailable, boundariesUTC, cadenceS)
	assisted := deriveSampleMetricsOnGrid(relay.Result.AssistedAvailable, boundariesUTC, cadenceS)
	if err := checkRelaySummary(relay.Result.Direct, direct); err != nil {
		return nil, err
	}
	if err := checkRelaySummary(relay.Result.Assisted, assisted); err != nil {
		return nil, err
	}
	if math.Abs(relay.Result.ImprovementFraction-(assisted.Fraction-direct.Fraction)) > 1e-12 {
		return nil, fmt.Errorf("improvement metric mismatch")
	}
	timestamps := relay.Provenance.SampleUTC
	sampleGrid := map[string]any{
		"cadenceS":         cadenceS,
		"sampleCount":      len(timestamps),
		"timestampsUtc":    timestamps,
		"elapsedS":         relay.Result.TimesS,
		"endExclusive":     true,
		"endUtc":           relay.Provenance.EndUTC,
		"binDurationS":     cadenceS,
		"timeScale":        "SPICE ET seconds; UTC labels converted by SPICE",
		"replayEpochEt":    relay.Provenance.EpochET,
		"missionEpochEt":   env.Provenance.EpochET,
		"epochDifferenceS": epochDifferenceS,
		"epochToleranceS":  1e-6,
		"nominalStartUtc":  query.StartUTC,
	}

	observer := map[string]any{
		"site":                source.Provenance.Site,
		"frame":               relay.Provenance.Frame,
		"positionM":           relay.Provenance.SitePositionM,
		"heightAboveTerrainM": 0,
		"groundElevationM":    env.Provenance.Terrain.GroundHeightM,
		"radialReferenceM":    env.Provenance.Terrain.RadialReferenceM,
		"longitudeConvention": "east-positive signed degrees",
	}
	samples := map[string]any{
		"directAvailable":     relay.Result.DirectAvailable,
		"viaRelayAvailable":   relay.Result.ViaRelayAvailable,
		"assistedAvailable":   relay.Result.AssistedAvailable,
		"siteRelayAvailable":  relay.Result.SiteRelayAvailable,
		"relayEarthAvailable": relay.Result.RelayEarthAvailable,
	}
	goImplementation := map[string]string{
		"relayFeed.go":        fmt.Sprintf("%x", sha256.Sum256(relayFeedSource)),
		"relayEngineering.go": fmt.Sprintf("%x", sha256.Sum256(relayEngineeringSource)),
	}
	identity := map[string]any{
		"algorithmVersion":      relayFeedAlgorithm,
		"goImplementation":      goImplementation,
		"request":               query,
		"candidateId":           request.CandidateID,
		"observer":              observer,
		"terrainConfig":         source.Provenance.TerrainConfig,
		"sources":               relay.Provenance.Sources,
		"relayImplementation":   source.Provenance.Implementation,
		"missionImplementation": json.RawMessage(env.Provenance.Implementation),
		"environmentCacheKey":   env.Provenance.CacheKey,
		"samples":               samples,
		"sampleGrid":            sampleGrid,
	}
	identityBytes, _ := json.Marshal(identity)
	// Cadence and satellite count already shape the identity through the grid and samples. Hashing them explicitly keeps the id from depending on that.
	scenarioID := fmt.Sprintf("relay-feed-%x", sha256.Sum256(append(identityBytes, fmt.Sprintf("|cadenceS=%d|satellites=%d", cadenceS, satellites)...)))
	epochUtc, validStartUtc, validEndUtc := relayTrajectoryValidity(tier, timestamps[0], relay.Provenance.EndUTC)
	trajectory := map[string]any{
		"candidateId":      request.CandidateID,
		"path":             trajectoryPath,
		"sha256":           trajectoryHash,
		"inputFrame":       "J2000",
		"center":           "MOON",
		"positionUnit":     "km",
		"velocityUnit":     "km/s",
		"epochUtc":         epochUtc,
		"validStartUtc":    validStartUtc,
		"validEndUtc":      validEndUtc,
		"propagationModel": source.Provenance.Dynamics,
		"satelliteCount":   satellites,
	}
	limitations := relayLimitations(tier, cadenceS)
	intervalMethod := map[string]any{
		"kind":                           "sample-derived",
		"convention":                     "half-open [start,end)",
		"representation":                 fmt.Sprintf("left-endpoint %d-second bins", cadenceS),
		"transitionTimesRefined":         false,
		"possibleMissedSubcadenceEvents": true,
		"physicalTransitionUncertaintyS": nil,
		"boundaryContinuityKnown":        false,
	}
	ladder := func(id, label, status string, metrics sampleMetrics) map[string]any {
		intervals := make([][]string, 0, len(metrics.AvailableIntervals))
		for _, interval := range metrics.AvailableIntervals {
			intervals = append(intervals, []string{interval.StartUTC, interval.EndUTC})
		}
		return map[string]any{
			"id":                    id,
			"label":                 label,
			"orbit_status":          status,
			"source":                relayLadderSource(tier),
			"as_of":                 time.Now().UTC().Format("2006-01-02"),
			"contact_share":         metrics.Fraction,
			"longest_gap_h":         float64(metrics.LongestBlackoutS) / 3600,
			"longest_gap_truncated": metrics.LongestBlackoutTouchesBoundary,
			"intervals":             intervals,
		}
	}
	return map[string]any{
		"schema_version": 1, "contractVersion": relayFeedVersion, "origin": "computed", "dataState": "computed", "site_id": query.SiteID, "scenarioId": scenarioID,
		"period": map[string]any{"start_utc": timestamps[0], "end_utc": relay.Provenance.EndUTC},
		"scenario": map[string]any{
			"request":          query,
			"candidateId":      request.CandidateID,
			"tier":             tier,
			"satellites":       satellites,
			"profile":          "geometric",
			"earthDefinition":  "center",
			"horizonOffsetDeg": 0,
			"terrainProfile":   request.TerrainProfile,
			"observer":         observer,
			"trajectory":       trajectory,
			"sourceIdentity":   identity,
		},
		"comparison": map[string]any{
			"durationS":                       query.DurationS,
			"grid":                            sampleGrid,
			"samples":                         samples,
			"direct":                          direct,
			"assisted":                        assisted,
			"improvementFraction":             assisted.Fraction - direct.Fraction,
			"intervalMethod":                  intervalMethod,
			"rfQualified":                     false,
			"rfAvailability":                  nil,
			"continuousAvailabilityValidated": false,
		},
		"validation": map[string]any{
			"status":                 "computed-with-cross-service-consistency-checks",
			"independentlyValidated": false,
			"checks":                 []string{"elapsed-grid-exact-absolute-ET-within-1us", "direct-booleans-exact", "observer-position-1e-6-m", "coordinates-1e-9-deg-wrapped-longitude", "frame-and-profile", "kernel-and-DEM-hashes", "request-and-epoch", "simultaneous-hop-booleans", "sample-metric-recomputation"},
		},
		"provenance": map[string]any{
			"algorithm_version": relayFeedAlgorithm,
			"sources":           []string{"Go synchronized mission-science and relay orchestration", trajectoryPath + " sha256=" + trajectoryHash},
			"assumptions":       limitations,
		},
		"scenarios": []any{ladder("direct", "Direct Earth (sampled)", "none", direct), ladder("nominal-candidate-2", "Direct or Candidate 2 (sampled)", "illustrative", assisted)},
	}, nil
}
