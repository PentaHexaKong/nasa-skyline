package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

type relayCompareRequest struct {
	SiteID    string `json:"siteId"`
	StartUTC  string `json:"startUtc"`
	DurationS int    `json:"durationS"`
}

type comparisonEnvironment struct {
	DataState string `json:"dataState"`
	Result    struct {
		TimesS []float64 `json:"timesS"`
		Bodies map[string]struct {
			ClearanceDeg []float64 `json:"clearanceDeg"`
		} `json:"bodies"`
	} `json:"result"`
	Provenance struct {
		Frame             string            `json:"frame"`
		Correction        string            `json:"correction"`
		ObserverPositionM []float64         `json:"observerPositionM"`
		Dems              map[string]string `json:"dems"`
		Kernels           map[string]string `json:"kernels"`
		Terrain           struct {
			SitePositionM []float64 `json:"sitePositionM"`
		} `json:"terrain"`
	} `json:"provenance"`
}

type comparisonRelay struct {
	DataState string `json:"dataState"`
	Result    struct {
		TimesS              []float64       `json:"timesS"`
		DirectAvailable     []bool          `json:"directAvailable"`
		ViaRelayAvailable   []bool          `json:"viaRelayAvailable"`
		SiteRelayAvailable  [][]bool        `json:"siteRelayAvailable"`
		RelayEarthAvailable [][]bool        `json:"relayEarthAvailable"`
		AssistedAvailable   []bool          `json:"assistedAvailable"`
		Direct              json.RawMessage `json:"direct"`
		Assisted            json.RawMessage `json:"assisted"`
		ImprovementFraction float64         `json:"improvementFraction"`
	} `json:"result"`
	Provenance struct {
		EpochET       float64           `json:"epochEt"`
		SampleUTC     []string          `json:"sampleUtc"`
		EndUTC        string            `json:"endUtc"`
		Frame         string            `json:"frame"`
		Correction    string            `json:"correction"`
		SitePositionM []float64         `json:"sitePositionM"`
		Sources       map[string]string `json:"sources"`
	} `json:"provenance"`
}

func callMissionService(ctx context.Context, client *http.Client, url string, payload any) ([]byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	request, err := http.NewRequestWithContext(ctx, "POST", url, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	body, err := io.ReadAll(io.LimitReader(response.Body, (16<<20)+1))
	if err != nil || len(body) > 16<<20 || response.StatusCode != 200 {
		return nil, fmt.Errorf("scientific service rejected evaluation (%d)", response.StatusCode)
	}
	return body, nil
}

func validateRelayComparison(environment comparisonEnvironment, relay comparisonRelay) error {
	if environment.DataState != "computed" || relay.DataState != "computed" {
		return fmt.Errorf("scientific evaluation unavailable")
	}
	if environment.Provenance.Frame != "MOON_ME_DE421" || relay.Provenance.Frame != environment.Provenance.Frame || environment.Provenance.Correction != "NONE" || relay.Provenance.Correction != "NONE" {
		return fmt.Errorf("incompatible frame or ephemeris profile")
	}
	site := environment.Provenance.ObserverPositionM
	if len(site) != 3 || len(relay.Provenance.SitePositionM) != 3 {
		return fmt.Errorf("missing observer position")
	}
	for index, value := range site {
		if math.IsNaN(value) || math.IsInf(value, 0) || math.IsNaN(relay.Provenance.SitePositionM[index]) || math.IsInf(relay.Provenance.SitePositionM[index], 0) || math.Abs(value-relay.Provenance.SitePositionM[index]) > 1e-6 {
			return fmt.Errorf("observer positions differ")
		}
	}
	relayHashes := map[string]string{}
	for path, hash := range relay.Provenance.Sources {
		relayHashes[filepath.Base(strings.ReplaceAll(path, "\\", "/"))] = hash
	}
	if len(environment.Provenance.Dems) != 2 || len(environment.Provenance.Kernels) != 7 {
		return fmt.Errorf("missing input identity")
	}
	for path, hash := range environment.Provenance.Dems {
		if relayHashes[filepath.Base(strings.ReplaceAll(path, "\\", "/"))] != hash {
			return fmt.Errorf("DEM identity mismatch")
		}
	}
	for name, hash := range environment.Provenance.Kernels {
		if relayHashes[name] != hash {
			return fmt.Errorf("kernel identity mismatch")
		}
	}
	times := relay.Result.TimesS
	margins := environment.Result.Bodies["EARTH"].ClearanceDeg
	if len(times) == 0 || len(environment.Result.TimesS) != len(times)+1 || len(margins) != len(times)+1 || len(relay.Result.DirectAvailable) != len(times) || len(relay.Result.AssistedAvailable) != len(times) {
		return fmt.Errorf("incompatible timeline shapes")
	}
	for index, value := range times {
		if value != float64(index*120) || value != environment.Result.TimesS[index] {
			return fmt.Errorf("timestamp mismatch")
		}
		if math.IsNaN(margins[index]) || math.IsInf(margins[index], 0) {
			return fmt.Errorf("nonfinite Earth clearance")
		}
		if (margins[index] >= 0) != relay.Result.DirectAvailable[index] {
			return fmt.Errorf("direct visibility mismatch at sample %d", index)
		}
		if relay.Result.DirectAvailable[index] && !relay.Result.AssistedAvailable[index] {
			return fmt.Errorf("invalid assisted connectivity")
		}
	}
	if environment.Result.TimesS[len(times)] != float64(len(times)*120) {
		return fmt.Errorf("endpoint mismatch")
	}
	return nil
}

func registerRelayEngineering(mux *http.ServeMux, client *http.Client) {
	boundedClient := *client
	boundedClient.Timeout = 90 * time.Second
	client = &boundedClient
	relayURL := strings.TrimRight(os.Getenv("RELAY_ADAPTER_URL"), "/")
	missionURL := strings.TrimRight(os.Getenv("MISSION_SCIENCE_URL"), "/")
	mux.HandleFunc("GET /api/relay-engineering/candidates", func(w http.ResponseWriter, r *http.Request) {
		if relayURL == "" {
			writeError(w, 503, "relay_unavailable", "Configure RELAY_ADAPTER_URL.")
			return
		}
		request, err := http.NewRequestWithContext(r.Context(), "GET", relayURL+"/v1/candidates", nil)
		if err != nil {
			writeError(w, 503, "relay_unavailable", "Invalid relay URL.")
			return
		}
		response, err := client.Do(request)
		if err != nil {
			writeError(w, 502, "relay_unavailable", "Relay service unavailable.")
			return
		}
		defer response.Body.Close()
		body, err := io.ReadAll(io.LimitReader(response.Body, 1<<20))
		if err != nil || response.StatusCode != 200 {
			writeError(w, 502, "relay_unavailable", "Candidate discovery failed.")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(body)
	})
	compareHandler := func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 90*time.Second)
		defer cancel()
		r = r.WithContext(ctx)
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(95 * time.Second))
		if relayURL == "" || missionURL == "" {
			writeError(w, 503, "relay_unavailable", "Configure relay and mission scientific services.")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 4096)
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		var query relayCompareRequest
		if decoder.Decode(&query) != nil {
			writeError(w, 422, "invalid_comparison", "Expected siteId, startUtc and durationS.")
			return
		}
		var trailing any
		if decoder.Decode(&trailing) != io.EOF {
			writeError(w, 422, "invalid_comparison", "Send one JSON object.")
			return
		}
		if query.DurationS <= 0 || query.DurationS > 86400 || query.DurationS%120 != 0 {
			writeError(w, 422, "unsupported_scenario", "Comparison supports aligned windows up to one day.")
			return
		}
		relayBody, err := callMissionService(r.Context(), client, relayURL+"/v1/evaluate", query)
		if err != nil {
			writeError(w, 422, "unsupported_scenario", err.Error())
			return
		}
		var replayClock comparisonRelay
		if json.Unmarshal(relayBody, &replayClock) != nil || len(replayClock.Provenance.SampleUTC) == 0 {
			writeError(w, 422, "scientific_incompatibility", "Missing actual replay timestamps.")
			return
		}
		missionQuery := map[string]any{"site": query.SiteID, "startUtc": replayClock.Provenance.SampleUTC[0], "durationS": query.DurationS, "cadenceS": 120, "profile": "geometric", "earthDefinition": "center", "solarDefinition": "anyDisk", "horizonOffsetDeg": 0, "localResolutionM": 80}
		environmentBody, err := callMissionService(r.Context(), client, missionURL+"/v1/evaluate", missionQuery)
		if err != nil {
			writeError(w, 502, "mission_unavailable", err.Error())
			return
		}
		var environment comparisonEnvironment
		var relay comparisonRelay
		if json.Unmarshal(environmentBody, &environment) != nil || json.Unmarshal(relayBody, &relay) != nil {
			writeError(w, 502, "invalid_scientific_response", "Malformed scientific response.")
			return
		}
		if err := validateRelayComparison(environment, relay); err != nil {
			writeError(w, 422, "scientific_incompatibility", err.Error())
			return
		}
		feed, err := buildRelayFeed(query, environmentBody, relayBody)
		if err != nil {
			writeError(w, 422, "scientific_incompatibility", err.Error())
			return
		}
		if r.URL.Path == "/api/relay-engineering/v1/relay-feed" {
			writeJSON(w, 200, feed)
			return
		}
		writeJSON(w, 200, map[string]any{"schemaVersion": "1.0", "dataState": "computed", "direct": relay.Result.Direct, "assisted": relay.Result.Assisted, "improvementFraction": relay.Result.ImprovementFraction, "rfQualified": false, "rfAvailability": nil, "cadenceS": 120, "interval": "half-open left-endpoint bins", "comparison": "exact direct boolean parity on common timestamps", "missionScience": json.RawMessage(environmentBody), "relayScience": json.RawMessage(relayBody)})
	}
	mux.HandleFunc("POST /api/relay-engineering/compare", compareHandler)
	mux.HandleFunc("POST /api/relay-engineering/v1/relay-feed", compareHandler)
}
