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
	if validateRelayComparison(comparisonEnvironment{}, comparisonRelay{}, 120) == nil {
		t.Fatal("accepted unavailable geometry")
	}
}
func TestRelayCompareValidation(t *testing.T) {
	t.Setenv("RELAY_ADAPTER_URL", "http://127.0.0.1:1")
	t.Setenv("MISSION_SCIENCE_URL", "http://127.0.0.1:1")
	mux := http.NewServeMux()
	registerRelayEngineering(mux, http.DefaultClient)
	post := func(body string) (int, string) {
		result := httptest.NewRecorder()
		mux.ServeHTTP(result, httptest.NewRequest("POST", "/api/relay-engineering/compare", strings.NewReader(body)))
		return result.Code, result.Body.String()
	}
	for name, body := range map[string]string{
		"zero satellites":       `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400,"satellites":0}`,
		"five satellites":       `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400,"satellites":5}`,
		"window over 28 days":   `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":2419201}`,
		"zero duration":         `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":0}`,
		"non-UTC start":         `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00+02:00","durationS":86400}`,
		"unknown field":         `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400,"cadenceS":120}`,
		"fractional satellites": `{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400,"satellites":2.5}`,
	} {
		code, response := post(body)
		if code != 422 || !strings.Contains(response, "invalid_comparison") {
			t.Fatal(name, code, response)
		}
	}
	// A 2026 window and an unaligned duration pass validation and only fail at the unreachable adapter.
	for _, body := range []string{
		`{"siteId":"CR1","startUtc":"2026-11-20T00:00:00Z","durationS":86400,"satellites":4}`,
		`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86401}`,
	} {
		code, response := post(body)
		if code != 422 || !strings.Contains(response, "unsupported_scenario") {
			t.Fatal(body, code, response)
		}
	}
}

func TestRelayCadenceChoice(t *testing.T) {
	for durationS, want := range map[int]int{120: 120, 86400: 120, 604800: 120, 720000: 120, 720120: 240, 1209600: 240, 2419200: 480} {
		if got := relayCadenceFor(durationS); got != want {
			t.Fatal(durationS, got, want)
		}
		if _, cadence, err := planRelayWindow(relayCompareRequest{SiteID: "CR1", StartUTC: "2026-11-20T00:00:00Z", DurationS: durationS}); err != nil || cadence != want {
			t.Fatal(durationS, cadence, err)
		}
	}
}

func TestRelayWindowFlooring(t *testing.T) {
	four := 4
	for _, test := range []struct {
		start     string
		durationS int
		wantStart string
		wantDur   int
		wantCad   int
	}{
		{"2026-11-20T05:13:00Z", 604800, "2026-11-20T05:12:00Z", 604800, 120},
		{"2026-11-20T05:13:59Z", 86459, "2026-11-20T05:12:00Z", 86400, 120},
		{"2026-11-20T00:07:30Z", 2419200, "2026-11-20T00:00:00Z", 2419200, 480},
		{"2026-11-20T00:07:30Z", 1209600, "2026-11-20T00:04:00Z", 1209600, 240},
		{"2025-01-06T00:00:00Z", 30, "2025-01-06T00:00:00Z", 120, 120},
		{"2024-12-31T23:59:00Z", 86400, "2024-12-31T23:58:00Z", 86400, 120},
	} {
		got, cadence, err := planRelayWindow(relayCompareRequest{SiteID: "CR1", StartUTC: test.start, DurationS: test.durationS, Satellites: &four})
		if err != nil || got.StartUTC != test.wantStart || got.DurationS != test.wantDur || cadence != test.wantCad {
			t.Fatal(test, got, cadence, err)
		}
		start, _ := time.Parse(time.RFC3339, got.StartUTC)
		if offset := start.Unix() - relayOrigin.Unix(); offset%int64(cadence) != 0 {
			t.Fatal("start off the cadence grid", test, got)
		}
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
	if err := validateRelayComparison(environment, relay, 120); err != nil {
		t.Fatal(err)
	}
	relay.Result.DirectAvailable[0] = true
	if validateRelayComparison(environment, relay, 120) == nil {
		t.Fatal("accepted mismatched direct availability")
	}
	relay.Result.DirectAvailable[0] = false
	relay.Provenance.Sources["a"] = "changed"
	if validateRelayComparison(environment, relay, 120) == nil {
		t.Fatal("accepted changed terrain")
	}
	relay.Provenance.Sources["a"] = "one"
	relay.Provenance.SitePositionM[0] = 2
	if validateRelayComparison(environment, relay, 120) == nil {
		t.Fatal("accepted observer mismatch")
	}
}

func TestComparisonValidatesRelayPositions(t *testing.T) {
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
	relay.Result.SiteRelayAvailable = [][]bool{{true, false}, {false, true}}
	if err := validateRelayComparison(environment, relay, 120); err != nil {
		t.Fatal("rejected a reply without positions:", err)
	}
	wellFormed := func() comparisonRelay {
		reply := relay
		reply.Result.PositionFrame = "MOON_ME_DE421"
		reply.Result.EarthPositionKm = [][]float64{{380000, 1, 2}, {380001, 1, 2}}
		reply.Result.RelayPositionKm = [][][]float64{{{1, 2, 6000}, {1, 3, 6000}}, {{2, 2, -6000}, {2, 3, -6000}}}
		return reply
	}
	if err := validateRelayComparison(environment, wellFormed(), 120); err != nil {
		t.Fatal(err)
	}
	cases := map[string]func(*comparisonRelay){
		"short Earth track":    func(r *comparisonRelay) { r.Result.EarthPositionKm = r.Result.EarthPositionKm[:1] },
		"missing satellite":    func(r *comparisonRelay) { r.Result.RelayPositionKm = r.Result.RelayPositionKm[:1] },
		"short relay track":    func(r *comparisonRelay) { r.Result.RelayPositionKm[1] = r.Result.RelayPositionKm[1][:1] },
		"two-component relay":  func(r *comparisonRelay) { r.Result.RelayPositionKm[0][1] = []float64{1, 3} },
		"two-component Earth":  func(r *comparisonRelay) { r.Result.EarthPositionKm[0] = []float64{380000, 1} },
		"Earth without relays": func(r *comparisonRelay) { r.Result.RelayPositionKm = nil },
		"other frame":          func(r *comparisonRelay) { r.Result.PositionFrame = "J2000" },
	}
	for name, mutate := range cases {
		candidate := wellFormed()
		mutate(&candidate)
		if validateRelayComparison(environment, candidate, 120) == nil {
			t.Fatal("accepted", name)
		}
	}
}

func TestRelayCompareForwardsPositions(t *testing.T) {
	env, relayBody := comparisonFixture(t)
	var relay map[string]any
	if err := json.Unmarshal(relayBody, &relay); err != nil {
		t.Fatal(err)
	}
	result := relay["result"].(map[string]any)
	samples := len(result["timesS"].([]any))
	earth := make([][]float64, samples)
	tracks := make([][][]float64, len(result["siteRelayAvailable"].([]any)))
	for index := range earth {
		earth[index] = []float64{380000, float64(index), -1200}
	}
	for satellite := range tracks {
		tracks[satellite] = make([][]float64, samples)
		for index := range tracks[satellite] {
			tracks[satellite][index] = []float64{1000.5, float64(satellite), 5800.1}
		}
	}
	result["positionFrame"] = "MOON_ME_DE421"
	result["earthPositionKm"] = earth
	result["relayPositionKm"] = tracks
	withPositions, err := json.Marshal(relay)
	if err != nil {
		t.Fatal(err)
	}
	broken := map[string]any{}
	if err := json.Unmarshal(withPositions, &broken); err != nil {
		t.Fatal(err)
	}
	broken["result"].(map[string]any)["earthPositionKm"] = earth[1:]
	brokenBody, err := json.Marshal(broken)
	if err != nil {
		t.Fatal(err)
	}
	for _, reply := range []struct {
		body []byte
		code int
	}{{withPositions, 200}, {brokenBody, 422}} {
		service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/mission/") {
				_, _ = w.Write(env)
			} else {
				_, _ = w.Write(reply.body)
			}
		}))
		t.Setenv("RELAY_ADAPTER_URL", service.URL+"/relay")
		t.Setenv("MISSION_SCIENCE_URL", service.URL+"/mission")
		mux := http.NewServeMux()
		registerRelayEngineering(mux, http.DefaultClient)
		recorder := httptest.NewRecorder()
		mux.ServeHTTP(recorder, httptest.NewRequest("POST", "/api/relay-engineering/compare", strings.NewReader(`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400}`)))
		service.Close()
		if recorder.Code != reply.code {
			t.Fatal(recorder.Code, recorder.Body.String())
		}
		if reply.code != 200 {
			continue
		}
		var response struct {
			RelayScience struct {
				Result struct {
					RelayPositionKm [][][]float64 `json:"relayPositionKm"`
					EarthPositionKm [][]float64   `json:"earthPositionKm"`
				} `json:"result"`
			} `json:"relayScience"`
		}
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatal(err)
		}
		forwarded := response.RelayScience.Result
		if len(forwarded.RelayPositionKm) != len(tracks) || len(forwarded.RelayPositionKm[1]) != samples || forwarded.RelayPositionKm[1][0][2] != 5800.1 || len(forwarded.EarthPositionKm) != samples || forwarded.EarthPositionKm[3][1] != 3 {
			t.Fatal("positions not forwarded on /compare")
		}
	}
}

func TestRelayCompareReportsBusyServiceAsRetryable(t *testing.T) {
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Mission science turns a concurrent request away with HTTP 503 and error.code "busy" (services/missionScience api.py).
		w.WriteHeader(503)
		_, _ = w.Write([]byte(`{"schemaVersion":"1.0","dataState":"unavailable","error":{"code":"busy"}}`))
	}))
	defer service.Close()
	t.Setenv("RELAY_ADAPTER_URL", service.URL+"/relay")
	t.Setenv("MISSION_SCIENCE_URL", service.URL+"/mission")
	mux := http.NewServeMux()
	registerRelayEngineering(mux, http.DefaultClient)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest("POST", "/api/relay-engineering/compare", strings.NewReader(`{"siteId":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":86400}`)))
	if recorder.Code != 503 || !strings.Contains(recorder.Body.String(), `"code":"busy"`) {
		t.Fatal(recorder.Code, recorder.Body.String())
	}
}
