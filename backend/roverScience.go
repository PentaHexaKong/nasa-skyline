package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"strings"
	"time"
)

func writeRoverError(w http.ResponseWriter, status int, code, message string) {
	writeJSON(w, status, map[string]any{
		"schemaVersion":  "skyline-rover-response/0.1.0",
		"contractStatus": "proposed-for-team-review",
		"dataState":      "unavailable", "scenarioId": nil,
		"request": nil, "result": nil, "provenance": nil, "coverage": nil,
		"units": scientificContractUnits{"deg", "m", "s", "fraction", "UTC ISO 8601"},
		"error": map[string]string{"code": code, "message": message},
	})
}

func validateRoverEnvelope(payload []byte) error {
	var envelope map[string]json.RawMessage
	if err := json.Unmarshal(payload, &envelope); err != nil {
		return err
	}
	var status string
	if json.Unmarshal(envelope["contractStatus"], &status) != nil || status != "proposed-for-team-review" {
		return errors.New("invalid rover contract review status")
	}
	delete(envelope, "contractStatus")
	common, err := json.Marshal(envelope)
	if err != nil {
		return err
	}
	return validateScientificEnvelopeVersion(common, "skyline-rover-response/0.1.0")
}

func registerRoverScience(mux *http.ServeMux, client *http.Client) {
	target := strings.TrimRight(os.Getenv("ROVER_SCIENCE_URL"), "/")
	boundedClient := *client
	boundedClient.Timeout = 600 * time.Second
	mux.HandleFunc("POST /api/rover-science/v1/reachability-evaluations", func(w http.ResponseWriter, r *http.Request) {
		if target == "" {
			writeRoverError(w, 503, "rover_not_configured", "The optional rover prototype is not configured.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), 600*time.Second)
		defer cancel()
		_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(605 * time.Second))
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 65536))
		if err != nil {
			writeRoverError(w, 413, "request_too_large", "Maximum rover request size is 64 KiB.")
			return
		}
		query, err := http.NewRequestWithContext(ctx, "POST", target+"/v1/reachability-evaluations", strings.NewReader(string(body)))
		if err != nil {
			writeRoverError(w, 503, "rover_unavailable", "Invalid optional rover service URL.")
			return
		}
		query.Header.Set("Content-Type", "application/json")
		response, err := boundedClient.Do(query)
		if err != nil {
			writeRoverError(w, 502, "rover_unavailable", "The optional rover service is unavailable.")
			return
		}
		defer response.Body.Close()
		payload, err := io.ReadAll(io.LimitReader(response.Body, (16<<20)+1))
		if err != nil || len(payload) > 16<<20 || response.StatusCode >= 300 && response.StatusCode < 400 {
			writeRoverError(w, 502, "invalid_rover_response", "Invalid optional rover response.")
			return
		}
		if validateRoverEnvelope(payload) != nil {
			writeRoverError(w, 502, "invalid_rover_response", "Rover service returned an invalid proposed contract.")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(response.StatusCode)
		_, _ = w.Write(payload)
	})
}
