package main

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
)

func TestMastPlacementContractAndProxy(t *testing.T) {
	payload, err := os.ReadFile("../examples/mastPlacementResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := validateScientificEnvelopeVersion(payload, "skyline-mast-placement-response/1.0.0"); err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/mast-placement-evaluations" {
			t.Error(r.URL.Path)
		}
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()
	t.Setenv("MISSION_SCIENCE_URL", upstream.URL)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	recorder := httptest.NewRecorder()
	mux.ServeHTTP(recorder, httptest.NewRequest("POST", "/api/mission-science/v1/mast-placement-evaluations", strings.NewReader(`{}`)))
	if recorder.Code != 200 || recorder.Body.String() != string(payload) {
		t.Fatal("Placement proxy altered the authoritative response", recorder.Code)
	}
}

func TestMastPlacementLive(t *testing.T) {
	target := os.Getenv("MISSION_SCIENCE_TEST_URL")
	if target == "" {
		t.Skip("Set MISSION_SCIENCE_TEST_URL")
	}
	t.Setenv("MISSION_SCIENCE_URL", target)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	bridge := httptest.NewServer(mux)
	defer bridge.Close()
	response, err := http.Post(bridge.URL+"/api/mission-science/v1/mast-placement-evaluations", "application/json", strings.NewReader(`{"site":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":3600,"cadenceS":1800,"searchRadiusM":0,"gridResolutionM":80,"mastHeightsM":[0],"maximumCableLengthM":0,"evaluationBudget":{"maxEvaluations":1,"maxWallTimeS":120}}`))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 {
		t.Fatal(response.StatusCode, string(body))
	}
	if err := validateScientificEnvelopeVersion(body, "skyline-mast-placement-response/1.0.0"); err != nil {
		t.Fatal(err)
	}
	var result struct {
		DataState string `json:"dataState"`
		Result    struct {
			Candidates []struct {
				EastM  float64 `json:"eastM"`
				NorthM float64 `json:"northM"`
			} `json:"candidates"`
			Optimization struct {
				Complete             bool `json:"complete"`
				EvaluationsPerformed int  `json:"evaluationsPerformed"`
			} `json:"optimization"`
		} `json:"result"`
	}
	if json.Unmarshal(body, &result) != nil || result.DataState != "computed" || len(result.Result.Candidates) != 1 || !result.Result.Optimization.Complete || result.Result.Optimization.EvaluationsPerformed != 1 || result.Result.Candidates[0].EastM != 0 || result.Result.Candidates[0].NorthM != 0 {
		t.Fatal(string(body))
	}
}
