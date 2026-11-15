package main

import (
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestReferenceEvaluationProxy(t *testing.T) {
	payload, err := os.ReadFile("../examples/scientificResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		if r.URL.Path != "/v1/reference-evaluations" || r.Method != http.MethodPost || !strings.Contains(string(body), "endUtc") {
			t.Error("Reference request identity was lost")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()
	t.Setenv("MISSION_SCIENCE_URL", upstream.URL)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	result := httptest.NewRecorder()
	mux.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/mission-science/v1/reference-evaluations", strings.NewReader(`{"site":"CR1","startUtc":"2025-01-06T00:00:00Z","endUtc":"2025-01-07T00:00:00Z"}`)))
	if result.Code != http.StatusOK || result.Body.String() != string(payload) {
		t.Fatal(result.Code, result.Body.String())
	}
}

func TestReferenceUnavailableUsesScientificContract(t *testing.T) {
	t.Setenv("MISSION_SCIENCE_URL", "")
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	result := httptest.NewRecorder()
	mux.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/mission-science/v1/reference-evaluations", strings.NewReader(`{}`)))
	if result.Code != http.StatusServiceUnavailable {
		t.Fatal(result.Code)
	}
	if err := validateScientificEnvelope(result.Body.Bytes()); err != nil {
		t.Fatal(err)
	}
}
