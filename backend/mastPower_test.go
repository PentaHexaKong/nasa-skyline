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

func TestMastPowerContractAndProxy(t *testing.T) {
	payload, err := os.ReadFile("../examples/mastPowerResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := validateScientificEnvelopeVersion(payload, "skyline-mast-power-response/1.0.0"); err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/mast-power-evaluations" {
			t.Error(r.URL.Path)
		}
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()
	t.Setenv("MISSION_SCIENCE_URL", upstream.URL)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	result := httptest.NewRecorder()
	mux.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/mission-science/v1/mast-power-evaluations", strings.NewReader(`{}`)))
	if result.Code != 200 || result.Body.String() != string(payload) {
		t.Fatal("mast/power response changed", result.Code)
	}
}

func TestMastPowerLive(t *testing.T) {
	target := os.Getenv("MISSION_SCIENCE_TEST_URL")
	if target == "" {
		t.Skip("Set MISSION_SCIENCE_TEST_URL")
	}
	t.Setenv("MISSION_SCIENCE_URL", target)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	bridge := httptest.NewServer(mux)
	defer bridge.Close()
	response, err := http.Post(bridge.URL+"/api/mission-science/v1/mast-power-evaluations", "application/json", strings.NewReader(`{"site":"CR1","startUtc":"2025-01-06T00:00:00Z","durationS":3600,"cadenceS":600,"mastHeightsM":[0,10],"verticalAzimuthDeg":90}`))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	body, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 {
		t.Fatal(response.StatusCode, string(body))
	}
	if err := validateScientificEnvelopeVersion(body, "skyline-mast-power-response/1.0.0"); err != nil {
		t.Fatal(err, string(body))
	}
	var result struct {
		DataState string `json:"dataState"`
		Result    struct {
			Outcomes []struct {
				Height float64 `json:"observerHeightM"`
			} `json:"outcomes"`
		} `json:"result"`
	}
	if json.Unmarshal(body, &result) != nil || result.DataState != "computed" || len(result.Result.Outcomes) != 2 || result.Result.Outcomes[1].Height != 10 {
		t.Fatal(string(body))
	}
}
