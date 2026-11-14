package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestMissionScienceProxy(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"dataState":"computed"}`))
	}))
	defer upstream.Close()
	t.Setenv("MISSION_SCIENCE_URL", upstream.URL)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	response := httptest.NewRecorder()
	mux.ServeHTTP(response, httptest.NewRequest("POST", "/api/mission-science/v1/evaluate", strings.NewReader(`{}`)))
	if response.Code != 200 || !strings.Contains(response.Body.String(), "computed") {
		t.Fatal(response.Code, response.Body.String())
	}
}
func TestMissionScienceLive(t *testing.T) {
	target := os.Getenv("MISSION_SCIENCE_TEST_URL")
	if target == "" {
		t.Skip("Set MISSION_SCIENCE_TEST_URL")
	}
	t.Setenv("MISSION_SCIENCE_URL", target)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	bridge := httptest.NewServer(mux)
	defer bridge.Close()
	response, err := http.Post(bridge.URL+"/api/mission-science/v1/evaluate", "application/json", strings.NewReader(`{"startUtc":"2025-01-01T00:00:00Z","durationS":3600,"cadenceS":600}`))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 || !strings.Contains(string(body), `"dataState":"computed"`) {
		t.Fatal(response.StatusCode, string(body))
	}
}

func TestSiteCatalogProxyContract(t *testing.T) {
	for _, route := range []string{"/v1/sites", "/v1/site-catalog", "/v1/capabilities"} {
		t.Run(route, func(t *testing.T) {
			const payload = `{"schemaVersion":"site-catalog/1.0.0","aliases":{},"sites":[]}`
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != http.MethodGet || r.URL.Path != route {
					t.Errorf("unexpected upstream request %s %s", r.Method, r.URL.Path)
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(payload))
			}))
			defer upstream.Close()
			t.Setenv("MISSION_SCIENCE_URL", upstream.URL)
			mux := http.NewServeMux()
			registerMissionScience(mux, http.DefaultClient)
			response := httptest.NewRecorder()
			mux.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/api/mission-science"+route, nil))
			if response.Code != http.StatusOK || response.Body.String() != payload {
				t.Fatal(response.Code, response.Body.String())
			}
		})
	}
}
