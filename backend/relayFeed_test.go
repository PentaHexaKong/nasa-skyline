package main

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func comparisonFixture(t *testing.T) ([]byte, []byte) {
	t.Helper()
	body, err := os.ReadFile("../examples/relayComparison.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture map[string]json.RawMessage
	if err := json.Unmarshal(body, &fixture); err != nil {
		t.Fatal(err)
	}
	// The saved fixture predates the adapter's tier fields, so add what the verified replay now reports.
	var relay map[string]any
	if err := json.Unmarshal(fixture["relayScience"], &relay); err != nil {
		t.Fatal(err)
	}
	provenance := relay["provenance"].(map[string]any)
	provenance["tier"] = relayTierVerified
	provenance["satellites"] = 2
	withTier, err := json.Marshal(relay)
	if err != nil {
		t.Fatal(err)
	}
	return fixture["missionScience"], withTier
}

func TestRelayFeedSampleIntervals(t *testing.T) {
	start := time.Date(2025, 1, 6, 0, 0, 0, 0, time.UTC)
	metrics := deriveSampleMetrics([]bool{false, true, false, false, true, false}, start, 120)
	if metrics.Fraction != 2./6 || metrics.AvailableDurationS != 240 || metrics.LongestBlackoutS != 240 || metrics.LongestBlackoutTouchesBoundary {
		t.Fatal(metrics)
	}
	if !metrics.BlackoutIntervals[0].StartClipped || !metrics.BlackoutIntervals[2].EndClipped || metrics.AvailableIntervals[0].StartClipped {
		t.Fatal(metrics)
	}
	if metrics.AvailableIntervals[0].StartUTC != "2025-01-06T00:02:00Z" || metrics.AvailableIntervals[0].EndUTC != "2025-01-06T00:04:00Z" {
		t.Fatal(metrics)
	}
	tied := deriveSampleMetrics([]bool{false, false, true, false, false, true}, start, 120)
	if tied.LongestBlackoutS != 240 || !tied.LongestBlackoutTouchesBoundary {
		t.Fatal("first longest tie was not selected", tied)
	}
	for _, available := range [][]bool{{true, true}, {false, false}, {true}, {false}} {
		metrics := deriveSampleMetrics(available, start, 120)
		if available[0] && (metrics.LongestBlackoutS != 0 || metrics.LongestBlackoutTouchesBoundary) {
			t.Fatal(metrics)
		}
		if !available[0] && (!metrics.LongestBlackoutTouchesBoundary || metrics.LongestBlackoutS != len(available)*120) {
			t.Fatal(metrics)
		}
	}
}

func TestRelayFeedRegressionAndRejections(t *testing.T) {
	env, relay := comparisonFixture(t)
	request := relayCompareRequest{SiteID: "CR1", StartUTC: "2025-01-06T00:00:00Z", DurationS: 86400}
	feed, err := buildRelayFeed(request, 120, env, relay)
	if err != nil {
		t.Fatal(err)
	}
	comparison := feed["comparison"].(map[string]any)
	if comparison["direct"].(sampleMetrics).Fraction != .3625 || comparison["assisted"].(sampleMetrics).Fraction != 1 {
		t.Fatal(comparison)
	}
	if comparison["direct"].(sampleMetrics).LongestBlackoutS != 55080 || !comparison["direct"].(sampleMetrics).LongestBlackoutTouchesBoundary {
		t.Fatal(comparison)
	}
	again, err := buildRelayFeed(request, 120, env, relay)
	if err != nil || again["scenarioId"] != feed["scenarioId"] {
		t.Fatal("unstable identity", err)
	}
	for _, mutation := range []string{"hop", "via", "assisted", "grid", "epoch", "summary", "candidate", "height", "trajectory", "coordinate", "missingHops", "missingObserverComponent", "disjointHops", "absoluteEpoch", "utcClock"} {
		t.Run(mutation, func(t *testing.T) {
			var altered map[string]any
			if err := json.Unmarshal(relay, &altered); err != nil {
				t.Fatal(err)
			}
			result := altered["result"].(map[string]any)
			provenance := altered["provenance"].(map[string]any)
			switch mutation {
			case "absoluteEpoch":
				provenance["epochEt"] = provenance["epochEt"].(float64) + .001
			case "utcClock":
				provenance["sampleUtc"].([]any)[1] = "2025-01-06T00:03:00Z"
			case "disjointHops":
				result["siteRelayAvailable"].([]any)[0].([]any)[0] = true
				result["relayEarthAvailable"].([]any)[0].([]any)[0] = false
				result["siteRelayAvailable"].([]any)[1].([]any)[0] = false
				result["relayEarthAvailable"].([]any)[1].([]any)[0] = true
			case "hop":
				result["siteRelayAvailable"].([]any)[0].([]any)[0] = false
				result["siteRelayAvailable"].([]any)[1].([]any)[0] = false
			case "via":
				result["viaRelayAvailable"].([]any)[0] = false
			case "assisted":
				result["assistedAvailable"].([]any)[0] = false
			case "grid":
				result["timesS"].([]any)[0] = 1.
			case "epoch":
				provenance["request"].(map[string]any)["startUtc"] = "2025-01-07T00:00:00Z"
			case "summary":
				result["direct"].(map[string]any)["fraction"] = .99
			case "candidate":
				provenance["request"].(map[string]any)["candidateId"] = "other"
			case "height":
				provenance["observerHeightM"] = 2.
			case "trajectory":
				for key := range provenance["sources"].(map[string]any) {
					if strings.HasSuffix(key, "candidate2States.csv") {
						provenance["sources"].(map[string]any)[key] = "changed"
					}
				}
			case "coordinate":
				provenance["site"].(map[string]any)["latitudeDeg"] = -89.
			case "missingHops":
				delete(result, "siteRelayAvailable")
			case "missingObserverComponent":
				provenance["sitePositionM"].([]any)[0] = nil
			}
			changed, _ := json.Marshal(altered)
			if _, err := buildRelayFeed(request, 120, env, changed); err == nil {
				t.Fatal("accepted inconsistent", mutation)
			}
		})
	}
	threeSatellites := 3
	for _, query := range []relayCompareRequest{
		{SiteID: "apollo11", StartUTC: request.StartUTC, DurationS: 86400},
		{SiteID: "CR1", StartUTC: "2026-11-20T00:00:00Z", DurationS: 86400},
		{SiteID: "CR1", StartUTC: request.StartUTC, DurationS: 86400, Satellites: &threeSatellites},
		{SiteID: "CR1", StartUTC: request.StartUTC, DurationS: 86400 * 29},
		{SiteID: "CR1", StartUTC: "2025-01-06T00:00:01Z", DurationS: 86400},
		{SiteID: "CR1", StartUTC: request.StartUTC, DurationS: 121},
	} {
		if _, err := buildRelayFeed(query, 120, env, relay); err == nil {
			t.Fatal("accepted unsupported query", query)
		}
	}
}

func TestRelayFeedTierText(t *testing.T) {
	verified := strings.Join(relayLimitations(relayTierVerified, 120), "|")
	if !strings.Contains(verified, "Saved two-body trajectory replay within its pinned 2025 epoch only") || !strings.Contains(verified, "120-second sampled geometry") {
		t.Fatal(verified)
	}
	propagated := strings.Join(relayLimitations(relayTierPropagated, 480), "|")
	for _, want := range []string{"480-second sampled geometry", "Two-body propagation of the verified Candidate 2 elements", "no Earth third-body", "no lunar gravity harmonics", "unvalidated away from January 2025"} {
		if !strings.Contains(propagated, want) {
			t.Fatal("missing", want, propagated)
		}
	}
	if strings.Contains(propagated, "pinned 2025 epoch") || strings.Contains(propagated, "120-second") {
		t.Fatal(propagated)
	}
}

func TestRelayTrajectoryValidity(t *testing.T) {
	epoch, start, end := relayTrajectoryValidity(relayTierVerified, "2025-01-06T00:00:00.000000Z", "2025-01-07T00:00:00.000000Z")
	if epoch != "2025-01-01T00:00:00Z" || start != "2025-01-01T00:00:00Z" || end != "2025-01-29T00:00:00Z" {
		t.Fatal(epoch, start, end)
	}
	epoch, start, end = relayTrajectoryValidity(relayTierPropagated, "2026-11-20T05:12:00.000000Z", "2026-12-18T05:12:00.000000Z")
	if epoch != "2026-11-20T05:12:00.000000Z" || start != epoch || end != "2026-12-18T05:12:00.000000Z" {
		t.Fatal(epoch, start, end)
	}
}

func TestRelayFeedVerifiedTierFields(t *testing.T) {
	env, relay := comparisonFixture(t)
	feed, err := buildRelayFeed(relayCompareRequest{SiteID: "CR1", StartUTC: "2025-01-06T00:00:00Z", DurationS: 86400}, 120, env, relay)
	if err != nil {
		t.Fatal(err)
	}
	scenario := feed["scenario"].(map[string]any)
	if scenario["tier"] != relayTierVerified || scenario["satellites"] != 2 {
		t.Fatal(scenario["tier"], scenario["satellites"])
	}
	trajectory := scenario["trajectory"].(map[string]any)
	if trajectory["validEndUtc"] != "2025-01-29T00:00:00Z" || trajectory["satelliteCount"] != 2 {
		t.Fatal(trajectory)
	}
	var altered map[string]any
	if err := json.Unmarshal(relay, &altered); err != nil {
		t.Fatal(err)
	}
	altered["provenance"].(map[string]any)["tier"] = relayTierPropagated
	changed, _ := json.Marshal(altered)
	if _, err := buildRelayFeed(relayCompareRequest{SiteID: "CR1", StartUTC: "2025-01-06T00:00:00Z", DurationS: 86400}, 120, env, changed); err == nil {
		t.Fatal("accepted a propagated tier for a verified-eligible window")
	}
}

func TestRelayFeedRoute(t *testing.T) {
	env, relay := comparisonFixture(t)
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, "/mission/") {
			_, _ = w.Write(env)
		} else {
			_, _ = w.Write(relay)
		}
	}))
	defer service.Close()
	t.Setenv("RELAY_ADAPTER_URL", service.URL+"/relay")
	t.Setenv("MISSION_SCIENCE_URL", service.URL+"/mission")
	mux := http.NewServeMux()
	registerRelayEngineering(mux, http.DefaultClient)
	for _, route := range []string{"/api/relay-engineering/compare", "/api/relay-engineering/v1/relay-feed"} {
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest("POST", route, strings.NewReader(`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400}`)))
		if recorder.Code != 200 {
			t.Fatal(recorder.Code, recorder.Body.String())
		}
		var response map[string]any
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		if route == "/api/relay-engineering/v1/relay-feed" && response["contractVersion"] != relayFeedVersion {
			t.Fatal(response)
		}
	}
}

func TestRelayFeedLive(t *testing.T) {
	relayURL := os.Getenv("RELAY_TEST_URL")
	missionURL := os.Getenv("MISSION_SCIENCE_TEST_URL")
	if relayURL == "" || missionURL == "" {
		t.Skip("Set both live scientific service URLs")
	}
	t.Setenv("RELAY_ADAPTER_URL", relayURL)
	t.Setenv("MISSION_SCIENCE_URL", missionURL)
	mux := http.NewServeMux()
	registerRelayEngineering(mux, http.DefaultClient)
	started := time.Now()
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/relay-engineering/v1/relay-feed", strings.NewReader(`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400}`)))
	if response.Code != 200 {
		t.Fatal(response.Code, response.Body.String())
	}
	var feed struct {
		ContractVersion string `json:"contractVersion"`
		Comparison      struct {
			Direct      sampleMetrics `json:"direct"`
			Assisted    sampleMetrics `json:"assisted"`
			RFQualified bool          `json:"rfQualified"`
		} `json:"comparison"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &feed); err != nil {
		t.Fatal(err)
	}
	if feed.ContractVersion != relayFeedVersion || feed.Comparison.Direct.Fraction != .3625 || feed.Comparison.Assisted.Fraction != 1 || feed.Comparison.RFQualified {
		t.Fatal(feed)
	}
	t.Log("live RelayFeed wall time", time.Since(started))
}
