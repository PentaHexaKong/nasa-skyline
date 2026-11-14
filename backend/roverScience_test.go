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

func TestRoverProposedProxyPreservesAuthoritativeResult(t *testing.T) {
	payload, err := os.ReadFile("../examples/roverResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/reachability-evaluations" {
			t.Error(r.URL.Path)
		}
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()
	t.Setenv("ROVER_SCIENCE_URL", upstream.URL)
	mux := http.NewServeMux()
	registerRoverScience(mux, http.DefaultClient)
	result := httptest.NewRecorder()
	mux.ServeHTTP(result, httptest.NewRequest("POST", "/api/rover-science/v1/reachability-evaluations", strings.NewReader(`{}`)))
	if result.Code != 200 || result.Body.String() != string(payload) {
		t.Fatal("Rover response altered", result.Code)
	}
}

func TestRoverOptionalFailuresPreserveNullResults(t *testing.T) {
	for _, configured := range []bool{false, true} {
		t.Run(map[bool]string{false: "disabled", true: "malformed"}[configured], func(t *testing.T) {
			target := ""
			if configured {
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					_, _ = w.Write([]byte(`{"dataState":"computed","result":null}`))
				}))
				defer upstream.Close()
				target = upstream.URL
			}
			t.Setenv("ROVER_SCIENCE_URL", target)
			mux := http.NewServeMux()
			registerRoverScience(mux, http.DefaultClient)
			result := httptest.NewRecorder()
			mux.ServeHTTP(result, httptest.NewRequest("POST", "/api/rover-science/v1/reachability-evaluations", strings.NewReader(`{}`)))
			if result.Code < 400 {
				t.Fatal(result.Code)
			}
			if err := validateRoverEnvelope(result.Body.Bytes()); err != nil {
				t.Fatal(err)
			}
			var response map[string]any
			_ = json.Unmarshal(result.Body.Bytes(), &response)
			if response["result"] != nil || response["contractStatus"] != "proposed-for-team-review" {
				t.Fatal(response)
			}
		})
	}
}

func TestRoverLiveOptionalPythonIntegration(t *testing.T) {
	target := os.Getenv("ROVER_SCIENCE_TEST_URL")
	if target == "" {
		t.Skip("Set ROVER_SCIENCE_TEST_URL")
	}
	t.Setenv("ROVER_SCIENCE_URL", target)
	mux := http.NewServeMux()
	registerRoverScience(mux, http.DefaultClient)
	bridge := httptest.NewServer(mux)
	defer bridge.Close()
	response, err := http.Post(bridge.URL+"/api/rover-science/v1/reachability-evaluations", "application/json", strings.NewReader(`{"site":"CR1","startUtc":"2025-01-06T18:00:00Z","durationS":240,"timeStepS":120,"gridRadiusCells":1,"speedMps":0.2,"maximumSlopeDeg":20,"movementRequiresSunlight":false,"movementRequiresCommunication":false,"stoppingRequiresSunlight":false,"stoppingRequiresCommunication":false}`))
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	payload, _ := io.ReadAll(response.Body)
	if response.StatusCode != 200 {
		t.Fatal(response.StatusCode, string(payload))
	}
	if err := validateRoverEnvelope(payload); err != nil {
		t.Fatal(err)
	}
	var result struct {
		DataState      string `json:"dataState"`
		ContractStatus string `json:"contractStatus"`
		Result         struct {
			Grid struct {
				Rows int `json:"rows"`
			} `json:"grid"`
			DirectOnly struct {
				DataState string `json:"dataState"`
			} `json:"directOnly"`
		} `json:"result"`
		Provenance struct {
			GeometryEvaluations int `json:"geometryEvaluations"`
		} `json:"provenance"`
	}
	if json.Unmarshal(payload, &result) != nil || result.DataState != "computed" || result.ContractStatus != "proposed-for-team-review" || result.Result.Grid.Rows != 3 || result.Result.DirectOnly.DataState != "computed" || result.Provenance.GeometryEvaluations != 0 {
		t.Fatal(string(payload))
	}
}
