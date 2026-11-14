package main

import (
	"bytes"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func scientificHandler(endpoint string, timeout time.Duration) http.Handler {
	cfg := config{scientificEngineURL: endpoint, requestTimeout: timeout}
	client := &http.Client{Timeout: timeout, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	return newHandler(cfg, client, slog.New(slog.NewJSONHandler(io.Discard, nil)))
}

func scienceRequest(handler http.Handler, body, mediaType string) *httptest.ResponseRecorder {
	req := httptest.NewRequest(http.MethodPost, "/api/scientificengine", strings.NewReader(body))
	req.Header.Set("Content-Type", mediaType)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)
	return res
}

func TestScientificEnginePreservesScienceAndRequestID(t *testing.T) {
	var downstreamID string
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		downstreamID = r.Header.Get("X-Request-ID")
		if r.URL.Path != "/analyze" {
			t.Errorf("unexpected path %s", r.URL.Path)
		}
		io.WriteString(w, `{"schemaVersion":"skyline-scientific-engine/1.0.0","dataState":"computed","result":{"marginDb":4.5}}`)
	}))
	defer service.Close()
	res := scienceRequest(scientificHandler(service.URL, time.Second), `{"input":{"schemaVersion":"skyline-science-request/1.0.0","operation":"describe"}}`, "application/json")
	if res.Code != 200 || !strings.Contains(res.Body.String(), `"marginDb":4.5`) {
		t.Fatalf("%d %s", res.Code, res.Body.String())
	}
	if downstreamID == "" || downstreamID != res.Header().Get("X-Request-ID") {
		t.Fatal("request ID not forwarded")
	}
}

func TestScientificEngineUnavailablePreserved(t *testing.T) {
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(422)
		io.WriteString(w, `{"dataState":"unavailable","error":{"code":"terrain_unavailable","message":"NoData"}}`)
	}))
	defer service.Close()
	res := scienceRequest(scientificHandler(service.URL, time.Second), `{"input":{}}`, "application/json")
	if res.Code != 422 || !strings.Contains(res.Body.String(), "terrain_unavailable") {
		t.Fatalf("%d %s", res.Code, res.Body.String())
	}
}

func TestScientificEngineInputLimits(t *testing.T) {
	for _, test := range []struct {
		name, body, media string
		status            int
	}{
		{"media", `{"input":{}}`, "text/plain", 415},
		{"scalar", `{"input":4}`, "application/json", 400},
		{"unknown", `{"input":{},"run_ml":true}`, "application/json", 400},
		{"trailing", `{"input":{}} {}`, "application/json", 400},
		{"limit", `{"input":{"x":"` + strings.Repeat("x", 1<<20) + `"}}`, "application/json", 413},
	} {
		t.Run(test.name, func(t *testing.T) {
			res := scienceRequest(scientificHandler("http://unused", time.Second), test.body, test.media)
			if res.Code != test.status {
				t.Fatalf("%d %s", res.Code, res.Body.String())
			}
		})
	}
}

func TestScientificEngineOptionalAndBadResponses(t *testing.T) {
	res := scienceRequest(scientificHandler("", time.Second), `{"input":{}}`, "application/json")
	if res.Code != 503 {
		t.Fatalf("unconfigured %d", res.Code)
	}
	for _, body := range []string{"not JSON", "[]", strings.Repeat("x", (1<<20)+1)} {
		service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { io.WriteString(w, body) }))
		res := scienceRequest(scientificHandler(service.URL, time.Second), `{"input":{}}`, "application/json")
		service.Close()
		if res.Code != 502 {
			t.Fatalf("invalid response %d", res.Code)
		}
	}
}

func TestScientificEngineDeadline(t *testing.T) {
	service := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(50 * time.Millisecond)
		io.WriteString(w, `{}`)
	}))
	defer service.Close()
	res := scienceRequest(scientificHandler(service.URL, time.Millisecond), `{"input":{}}`, "application/json")
	if res.Code != 504 {
		t.Fatalf("%d %s", res.Code, res.Body.String())
	}
}

func TestScientificEngineLive(t *testing.T) {
	endpoint := os.Getenv("SCIENTIFIC_ENGINE_TEST_URL")
	if endpoint == "" {
		t.Skip("set SCIENTIFIC_ENGINE_TEST_URL for real Python scientific integration")
	}
	bridge := httptest.NewServer(scientificHandler(endpoint, 20*time.Second))
	defer bridge.Close()
	for _, operation := range []string{"describe", "mission", "unsupported"} {
		parameters := map[string]any{}
		if operation == "mission" {
			parameters = map[string]any{"scope": "S1_CR1_CONNECTING_RIDGE", "orbit": "C4", "mastHeightM": 0}
		}
		payload, _ := json.Marshal(map[string]any{"input": map[string]any{"schemaVersion": "skyline-science-request/1.0.0", "operation": operation, "parameters": parameters}})
		response, err := http.Post(bridge.URL+"/api/scientificengine", "application/json", bytes.NewReader(payload))
		if err != nil {
			t.Fatal(err)
		}
		body, _ := io.ReadAll(response.Body)
		response.Body.Close()
		expectedStatus, expectedState := 200, "computed"
		if operation == "unsupported" {
			expectedStatus, expectedState = 400, "unavailable"
		}
		if response.StatusCode != expectedStatus {
			t.Fatalf("%d %s", response.StatusCode, body)
		}
		var result map[string]any
		if json.Unmarshal(body, &result) != nil || result["dataState"] != expectedState {
			t.Fatalf("invalid scientific response %s", body)
		}
		if result["schemaVersion"] != "skyline-scientific-engine/1.0.0" {
			t.Fatal("wrong engine version")
		}
		if directory := os.Getenv("SCIENTIFIC_ENGINE_CAPTURE_DIR"); directory != "" {
			if err := os.MkdirAll(directory, 0755); err != nil {
				t.Fatal(err)
			}
			name := "scientificengine-" + operation + ".computed.json"
			if operation == "mission" {
				name = "scientificengine-result.computed.json"
			}
			if operation == "unsupported" {
				name = "scientificengine-error.unavailable.json"
			}
			if err := os.WriteFile(filepath.Join(directory, name), body, 0644); err != nil {
				t.Fatal(err)
			}
		}
	}
}
