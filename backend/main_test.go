package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

func testHandler(t *testing.T, ds, ml http.HandlerFunc, timeout time.Duration) (http.Handler, *bytes.Buffer) {
	t.Helper()
	dsServer := httptest.NewServer(ds)
	mlServer := httptest.NewServer(ml)
	t.Cleanup(dsServer.Close)
	t.Cleanup(mlServer.Close)
	logs := &bytes.Buffer{}
	cfg := config{dsURL: dsServer.URL, mlURL: mlServer.URL, requestTimeout: timeout}
	return newHandler(cfg, &http.Client{Timeout: timeout}, slog.New(slog.NewJSONHandler(logs, nil))), logs
}

func sendRun(handler http.Handler, body, contentType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/run", strings.NewReader(body))
	req.Header.Set("Content-Type", contentType)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	return res
}

func TestRunForwardsInputDSResultAndRequestID(t *testing.T) {
	var dsID, mlID string
	handler, logs := testHandler(t, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/analyze" || r.Method != "POST" {
			t.Errorf("DS route: %s %s", r.Method, r.URL.Path)
		}
		dsID = r.Header.Get("X-Request-ID")
		var payload runRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		if string(payload.Input) != `{"site_id":"fixture"}` {
			t.Errorf("input changed: %s", payload.Input)
		}
		io.WriteString(w, `{"status":"stub_only","timeline":[]}`)
	}, func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/predict" {
			t.Errorf("ML path: %s", r.URL.Path)
		}
		mlID = r.Header.Get("X-Request-ID")
		var payload map[string]json.RawMessage
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		if string(payload["ds_result"]) != `{"status":"stub_only","timeline":[]}` {
			t.Errorf("DS result changed: %s", payload["ds_result"])
		}
		io.WriteString(w, `{"status":"stub_only"}`)
	}, time.Second)
	res := sendRun(handler, `{"input":{"site_id":"fixture"}}`, "application/json")
	if res.Code != 200 {
		t.Fatalf("%d: %s", res.Code, res.Body)
	}
	var result runResponse
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	id := res.Header().Get("X-Request-ID")
	if id == "" || id != result.RequestID || id != dsID || id != mlID {
		t.Fatalf("request IDs differ: %q %q %q %q", id, result.RequestID, dsID, mlID)
	}
	if !strings.Contains(logs.String(), `"request_id":"`+id+`"`) {
		t.Fatalf("missing ID in log: %s", logs)
	}
}

func TestRunRejectsInvalidRequestsBeforeCallingServices(t *testing.T) {
	never := func(w http.ResponseWriter, r *http.Request) { t.Error("downstream must not be called") }
	handler, _ := testHandler(t, never, never, time.Second)
	cases := []struct {
		name, body, contentType string
		code                    int
	}{
		{"missing input", `{}`, "application/json", 400},
		{"null input", `{"input":null}`, "application/json", 400},
		{"array input", `{"input":[]}`, "application/json", 400},
		{"invalid JSON", `{"input":`, "application/json", 400},
		{"extra JSON", `{"input":{}} {}`, "application/json", 400},
		{"unknown envelope field", `{"input":{},"typo":true}`, "application/json", 400},
		{"invalid ML flag", `{"input":{},"run_ml":"false"}`, "application/json", 400},
		{"wrong content type", `{"input":{}}`, "text/plain", 415},
		{"oversized input", `{"input":{"x":"` + strings.Repeat("a", 1<<20) + `"}}`, "application/json", 413},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			res := sendRun(handler, tc.body, tc.contentType)
			if res.Code != tc.code {
				t.Fatalf("got %d want %d: %s", res.Code, tc.code, res.Body)
			}
			if !json.Valid(res.Body.Bytes()) {
				t.Fatal("error is not JSON")
			}
			if res.Header().Get("X-Request-ID") == "" {
				t.Fatal("missing error request ID")
			}
		})
	}
}

func TestDSOnlySkipsML(t *testing.T) {
	handler, _ := testHandler(t, func(w http.ResponseWriter, r *http.Request) {
		io.WriteString(w, `{"status":"stub_only"}`)
	}, func(w http.ResponseWriter, r *http.Request) { t.Error("ML must be skipped") }, time.Second)
	res := sendRun(handler, `{"input":{},"run_ml":false}`, "application/json")
	if res.Code != 200 || !strings.Contains(res.Body.String(), `"ml":{"status":"skipped"}`) {
		t.Fatalf("%d: %s", res.Code, res.Body)
	}
}

func TestDownstreamFailures(t *testing.T) {
	for _, tc := range []struct {
		name, body string
		status     int
	}{
		{"non JSON", "invalid", 200}, {"non success", `{}`, 503},
		{"oversized valid JSON prefix", `{}` + strings.Repeat(" ", 1<<20), 200},
	} {
		t.Run(tc.name, func(t *testing.T) {
			handler, _ := testHandler(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tc.status)
				io.WriteString(w, tc.body)
			}, func(w http.ResponseWriter, r *http.Request) { t.Error("ML called after DS failure") }, time.Second)
			res := sendRun(handler, `{"input":{}}`, "application/json")
			if res.Code != 502 {
				t.Fatalf("%d: %s", res.Code, res.Body)
			}
		})
	}
}

func TestMLFailureReturns502(t *testing.T) {
	handler, _ := testHandler(t, func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, `{}`) },
		func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }, time.Second)
	res := sendRun(handler, `{"input":{}}`, "application/json")
	if res.Code != 502 || !strings.Contains(res.Body.String(), "ml_request_failed") {
		t.Fatalf("%d: %s", res.Code, res.Body)
	}
}

func TestDeadlineReturns504(t *testing.T) {
	handler, _ := testHandler(t, func(w http.ResponseWriter, r *http.Request) {
		select {
		case <-r.Context().Done():
		case <-time.After(150 * time.Millisecond):
		}
	},
		func(w http.ResponseWriter, r *http.Request) { t.Error("ML called after DS timeout") }, 30*time.Millisecond)
	res := sendRun(handler, `{"input":{}}`, "application/json")
	if res.Code != 504 {
		t.Fatalf("%d: %s", res.Code, res.Body)
	}
}

func TestLivenessAndDependencyReadiness(t *testing.T) {
	unavailable := func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(503) }
	handler, _ := testHandler(t, unavailable, unavailable, time.Second)
	for _, tc := range []struct {
		path string
		code int
	}{{"/livez", 200}, {"/healthz", 503}} {
		res := httptest.NewRecorder()
		handler.ServeHTTP(res, httptest.NewRequest("GET", tc.path, nil))
		if res.Code != tc.code {
			t.Fatalf("%s: got %d want %d", tc.path, res.Code, tc.code)
		}
	}
}

func TestTimeoutMapping(t *testing.T) {
	res := httptest.NewRecorder()
	writeDownstreamError(res, context.DeadlineExceeded, "ml")
	if res.Code != 504 || !strings.Contains(res.Body.String(), "ml_timeout") {
		t.Fatal(res.Body.String())
	}
}

// This verifies transport compatibility with the proposed contract, not scientific validation.
func TestProposedCLPSFixturesRoundTrip(t *testing.T) {
	request, err := os.ReadFile("../examples/clps-request.fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	fixture, err := os.ReadFile("../examples/clps-ds-result.fixture.json")
	if err != nil {
		t.Fatal(err)
	}
	var expected map[string]any
	if err := json.Unmarshal(fixture, &expected); err != nil {
		t.Fatal(err)
	}
	handler, _ := testHandler(t, func(w http.ResponseWriter, r *http.Request) {
		var payload runRequest
		if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
			t.Error(err)
		}
		var input map[string]any
		if err := json.Unmarshal(payload.Input, &input); err != nil {
			t.Error(err)
		}
		if input["schema_version"] != "clps-analysis-v1" {
			t.Error("version was not forwarded")
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write(fixture)
	}, func(w http.ResponseWriter, r *http.Request) { t.Error("baseline fixture must skip ML") }, time.Second)
	res := sendRun(handler, string(request), "application/json")
	if res.Code != 200 {
		t.Fatalf("%d: %s", res.Code, res.Body)
	}
	var result runResponse
	if err := json.Unmarshal(res.Body.Bytes(), &result); err != nil {
		t.Fatal(err)
	}
	var actual map[string]any
	if err := json.Unmarshal(result.DS, &actual); err != nil {
		t.Fatal(err)
	}
	expectedJSON, _ := json.Marshal(expected)
	actualJSON, _ := json.Marshal(actual)
	if !bytes.Equal(expectedJSON, actualJSON) {
		t.Fatal("DS fixture changed during forwarding")
	}
	if actual["data_state"] != "fixture" {
		t.Fatal("fixture label lost")
	}
	if actual["summary"].(map[string]any)["direct_earth_visible_fraction"] != nil {
		t.Fatal("uncomputed metric must stay null")
	}
}
