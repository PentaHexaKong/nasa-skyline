package main

import (
	"context"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func registerMissionScience(mux *http.ServeMux, client *http.Client) {
	boundedClient := *client
	boundedClient.Timeout = 90 * time.Second
	client = &boundedClient
	target := strings.TrimRight(os.Getenv("MISSION_SCIENCE_URL"), "/")
	mux.HandleFunc("/api/mission-science/", func(w http.ResponseWriter, r *http.Request) {
		route := strings.TrimPrefix(r.URL.Path, "/api/mission-science")
		timeout := 90 * time.Second
		requestClient := client
		if route == "/v1/mast-power-evaluations" || route == "/v1/mast-placement-evaluations" {
			timeout = 10 * time.Minute
			mastClient := *client
			mastClient.Timeout = timeout
			requestClient = &mastClient
		}
		ctx, cancel := context.WithTimeout(r.Context(), timeout)
		defer cancel()
		r = r.WithContext(ctx)
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(timeout + 5*time.Second))
		proxyError := writeError
		expectedVersion := "skyline-scientific-response/1.0.0"
		if route == "/v1/mast-power-evaluations" {
			proxyError = writeMastPowerError
			expectedVersion = "skyline-mast-power-response/1.0.0"
		}
		if route == "/v1/mast-placement-evaluations" {
			proxyError = writeMastPlacementError
			expectedVersion = "skyline-mast-placement-response/1.0.0"
		}
		if route == "/v1/scientific-evaluations" {
			proxyError = writeScientificError
		}
		valid := (r.Method == "GET" && (route == "/v1/sites" || route == "/v1/capabilities" || route == "/v1/site-catalog")) || (r.Method == "POST" && (route == "/v1/evaluate" || route == "/v1/scientific-evaluations" || route == "/v1/mast-power-evaluations" || route == "/v1/mast-placement-evaluations"))
		if !valid {
			http.NotFound(w, r)
			return
		}
		if target == "" {
			proxyError(w, 503, "mission_science_unavailable", "Configure MISSION_SCIENCE_URL.")
			return
		}
		body := http.MaxBytesReader(w, r.Body, 1<<20)
		payload, err := io.ReadAll(body)
		if err != nil {
			proxyError(w, 413, "request_too_large", "Request exceeds limit.")
			return
		}
		req, err := http.NewRequestWithContext(r.Context(), r.Method, target+route, strings.NewReader(string(payload)))
		if err != nil {
			proxyError(w, 503, "mission_science_unavailable", "Invalid service URL.")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		response, err := requestClient.Do(req)
		if err != nil {
			proxyError(w, 502, "mission_science_unavailable", "Scientific service request failed.")
			return
		}
		defer response.Body.Close()
		result, err := io.ReadAll(io.LimitReader(response.Body, (16<<20)+1))
		if err != nil || len(result) > 16<<20 || response.StatusCode >= 300 && response.StatusCode < 400 {
			proxyError(w, 502, "invalid_scientific_response", "Scientific response exceeded transport bounds.")
			return
		}
		if route == "/v1/scientific-evaluations" || route == "/v1/mast-power-evaluations" || route == "/v1/mast-placement-evaluations" {
			if err := validateScientificEnvelopeVersion(result, expectedVersion); err != nil {
				proxyError(w, 502, "invalid_scientific_response", "Scientific service returned an invalid versioned envelope.")
				return
			}
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(result)
	})
}
