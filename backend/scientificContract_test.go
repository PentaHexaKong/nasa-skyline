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

func TestScientificContractRealExample(t *testing.T) {
	payload, err := os.ReadFile("../examples/scientificResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := validateScientificEnvelope(payload); err != nil {
		t.Fatal(err)
	}
}

func TestScientificContractRejectsMissingStatesAndInvalidUnits(t *testing.T) {
	payload, err := os.ReadFile("../examples/scientificResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	for _, field := range []string{"schemaVersion", "dataState", "result", "provenance", "units"} {
		t.Run(field, func(t *testing.T) {
			var response map[string]any
			if err := json.Unmarshal(payload, &response); err != nil {
				t.Fatal(err)
			}
			delete(response, field)
			encoded, _ := json.Marshal(response)
			if validateScientificEnvelope(encoded) == nil {
				t.Fatal("accepted missing", field)
			}
		})
	}
}

func TestScientificProxyValidatesAndPreservesContract(t *testing.T) {
	payload, err := os.ReadFile("../examples/scientificResponse.computed.json")
	if err != nil {
		t.Fatal(err)
	}
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/scientific-evaluations" {
			t.Error(r.URL.Path)
		}
		_, _ = w.Write(payload)
	}))
	defer upstream.Close()
	t.Setenv("MISSION_SCIENCE_URL", upstream.URL)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	result := httptest.NewRecorder()
	mux.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/mission-science/v1/scientific-evaluations", strings.NewReader(`{}`)))
	if result.Code != 200 || result.Body.String() != string(payload) {
		t.Fatal("scientific response changed", result.Code)
	}
}

func TestScientificProxyNeverFillsMissingData(t *testing.T) {
	for _, available := range []bool{true, false} {
		t.Run(map[bool]string{true: "malformed", false: "unconfigured"}[available], func(t *testing.T) {
			target := ""
			if available {
				upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					_, _ = w.Write([]byte(`{"dataState":"computed","result":null}`))
				}))
				defer upstream.Close()
				target = upstream.URL
			}
			t.Setenv("MISSION_SCIENCE_URL", target)
			mux := http.NewServeMux()
			registerMissionScience(mux, http.DefaultClient)
			result := httptest.NewRecorder()
			mux.ServeHTTP(result, httptest.NewRequest(http.MethodPost, "/api/mission-science/v1/scientific-evaluations", strings.NewReader(`{}`)))
			if result.Code < 400 {
				t.Fatal(result.Code)
			}
			if err := validateScientificEnvelope(result.Body.Bytes()); err != nil {
				t.Fatal(err, result.Body.String())
			}
			var response scientificContractEnvelope
			_ = json.Unmarshal(result.Body.Bytes(), &response)
			if presentJSON(response.Result) {
				t.Fatal("error produced scientific values")
			}
		})
	}
}

func TestUnifiedScientificLive(t *testing.T) {
	target := os.Getenv("MISSION_SCIENCE_TEST_URL")
	if target == "" {
		t.Skip("Set MISSION_SCIENCE_TEST_URL for live Python integration")
	}
	t.Setenv("MISSION_SCIENCE_URL", target)
	mux := http.NewServeMux()
	registerMissionScience(mux, http.DefaultClient)
	bridge := httptest.NewServer(mux)
	defer bridge.Close()
	for _, site := range []string{"CR1", "CE4", "apollo11", "CE4_LROC2019", "CE6", "CY3", "SLIM", "LUNA25_TARGET", "LUNA25_IMPACT"} {
		resolution := "1895.21"
		if site == "CR1" || site == "CE4" {
			resolution = "80"
		}
		response, err := http.Post(bridge.URL+"/api/mission-science/v1/scientific-evaluations", "application/json", strings.NewReader(`{"site":"`+site+`","startUtc":"2025-01-01T00:00:00Z","durationS":3600,"cadenceS":600,"localResolutionM":`+resolution+`}`))
		if err != nil {
			t.Fatal(err)
		}
		body, err := io.ReadAll(response.Body)
		response.Body.Close()
		if err != nil || response.StatusCode != 200 {
			t.Fatal(response.StatusCode, err, string(body))
		}
		if err := validateScientificEnvelope(body); err != nil {
			t.Fatal(err)
		}
		var result scientificContractEnvelope
		_ = json.Unmarshal(body, &result)
		expected := "computed"
		if site == "CE4" {
			expected = "unsupported"
		}
		if result.DataState != expected {
			t.Fatal(string(body))
		}
	}
}
