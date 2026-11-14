package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func TestRejectMismatchedRelayGeometry(t *testing.T) {
	if validateRelayComparison(comparisonEnvironment{}, comparisonRelay{}) == nil {
		t.Fatal("accepted unavailable geometry")
	}
}
func TestRelayUnsupportedWindow(t *testing.T) {
	t.Setenv("RELAY_ADAPTER_URL", "http://127.0.0.1:1")
	t.Setenv("MISSION_SCIENCE_URL", "http://127.0.0.1:1")
	mux := http.NewServeMux()
	registerRelayEngineering(mux, http.DefaultClient)
	result := httptest.NewRecorder()
	mux.ServeHTTP(result, httptest.NewRequest("POST", "/api/relay-engineering/compare", strings.NewReader(`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86401}`)))
	if result.Code != 422 {
		t.Fatal(result.Code)
	}
}
func TestRelayLiveComparison(t *testing.T) {
	relay := os.Getenv("RELAY_TEST_URL")
	mission := os.Getenv("MISSION_SCIENCE_TEST_URL")
	if relay == "" || mission == "" {
		t.Skip("Set both live scientific service URLs")
	}
	t.Setenv("RELAY_ADAPTER_URL", relay)
	t.Setenv("MISSION_SCIENCE_URL", mission)
	mux := http.NewServeMux()
	registerRelayEngineering(mux, &http.Client{Timeout: 90 * time.Second})
	bridge := httptest.NewServer(mux)
	defer bridge.Close()
	start := time.Now()
	response, err := http.Post(bridge.URL+"/api/relay-engineering/compare", "application/json", strings.NewReader(`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400}`))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 {
		t.Fatal(response.StatusCode, string(body))
	}
	var result struct {
		DataState   string  `json:"dataState"`
		Improvement float64 `json:"improvementFraction"`
	}
	if json.Unmarshal(body, &result) != nil || result.DataState != "computed" || result.Improvement <= 0 {
		t.Fatal(string(body))
	}
	if path := os.Getenv("RELAY_COMPARISON_REPORT"); path != "" {
		if err := os.WriteFile(path, body, 0600); err != nil {
			t.Fatal(err)
		}
	}
	t.Log("live comparison wall time", time.Since(start))
}
func TestComparisonRejectsInputAndTimelineDifferences(t *testing.T) {
	environment := comparisonEnvironment{}
	relay := comparisonRelay{}
	environment.DataState = "computed"
	relay.DataState = "computed"
	environment.Provenance.Frame = "MOON_ME_DE421"
	relay.Provenance.Frame = "MOON_ME_DE421"
	environment.Provenance.Correction = "NONE"
	relay.Provenance.Correction = "NONE"
	environment.Provenance.ObserverPositionM = []float64{1, 2, 3}
	relay.Provenance.SitePositionM = []float64{1, 2, 3}
	environment.Provenance.Dems = map[string]string{"a": "one", "b": "two"}
	environment.Provenance.Kernels = map[string]string{}
	relay.Provenance.Sources = map[string]string{"a": "one", "b": "two"}
	for _, name := range []string{"k1", "k2", "k3", "k4", "k5", "k6", "k7"} {
		environment.Provenance.Kernels[name] = name
		relay.Provenance.Sources[name] = name
	}
	environment.Result.TimesS = []float64{0, 120, 240}
	environment.Result.Bodies = map[string]struct {
		ClearanceDeg []float64 `json:"clearanceDeg"`
	}{"EARTH": {ClearanceDeg: []float64{-1, 1, 1}}}
	relay.Result.TimesS = []float64{0, 120}
	relay.Result.DirectAvailable = []bool{false, true}
	relay.Result.AssistedAvailable = []bool{true, true}
	if err := validateRelayComparison(environment, relay); err != nil {
		t.Fatal(err)
	}
	relay.Result.DirectAvailable[0] = true
	if validateRelayComparison(environment, relay) == nil {
		t.Fatal("accepted mismatched direct availability")
	}
	relay.Result.DirectAvailable[0] = false
	relay.Provenance.Sources["a"] = "changed"
	if validateRelayComparison(environment, relay) == nil {
		t.Fatal("accepted changed terrain")
	}
	relay.Provenance.Sources["a"] = "one"
	relay.Provenance.SitePositionM[0] = 2
	if validateRelayComparison(environment, relay) == nil {
		t.Fatal("accepted observer mismatch")
	}
}
