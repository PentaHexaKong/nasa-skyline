package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

type scientificContractError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

type scientificContractUnits struct {
	Angles     string `json:"angles"`
	Distances  string `json:"distances"`
	Durations  string `json:"durations"`
	Fractions  string `json:"fractions"`
	Timestamps string `json:"timestamps"`
}

type scientificContractEnvelope struct {
	SchemaVersion string                   `json:"schemaVersion"`
	DataState     string                   `json:"dataState"`
	ScenarioID    *string                  `json:"scenarioId"`
	Request       json.RawMessage          `json:"request"`
	Units         scientificContractUnits  `json:"units"`
	Result        json.RawMessage          `json:"result"`
	Provenance    json.RawMessage          `json:"provenance"`
	Coverage      json.RawMessage          `json:"coverage"`
	Error         *scientificContractError `json:"error"`
}

func presentJSON(value json.RawMessage) bool {
	return len(value) > 0 && string(bytes.TrimSpace(value)) != "null"
}

func validateScientificEnvelope(payload []byte) error {
	return validateScientificEnvelopeVersion(payload, "skyline-scientific-response/1.0.0")
}

func validateScientificEnvelopeVersion(payload []byte, expectedVersion string) error {
	var response scientificContractEnvelope
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&response); err != nil {
		return err
	}
	if decoder.Decode(new(any)) != io.EOF {
		return errors.New("trailing scientific JSON")
	}
	if response.SchemaVersion != expectedVersion {
		return errors.New("unsupported scientific response version")
	}
	if response.Units != (scientificContractUnits{"deg", "m", "s", "fraction", "UTC ISO 8601"}) {
		return errors.New("invalid scientific units")
	}
	switch response.DataState {
	case "computed":
		if !presentJSON(response.Result) || !presentJSON(response.Provenance) || !presentJSON(response.Request) || response.ScenarioID == nil || *response.ScenarioID == "" || response.Error != nil {
			return errors.New("incomplete computed response")
		}
	case "unsupported", "not_computed", "unavailable", "failed":
		if presentJSON(response.Result) || presentJSON(response.Provenance) || response.Error == nil || response.Error.Code == "" || response.Error.Message == "" {
			return errors.New("noncomputed response contains scientific values or lacks an error")
		}
	default:
		return errors.New("unknown scientific availability state")
	}
	return nil
}

func writeScientificError(w http.ResponseWriter, status int, code, message string) {
	writeScientificErrorVersion(w, status, code, message, "skyline-scientific-response/1.0.0")
}

func writeMastPowerError(w http.ResponseWriter, status int, code, message string) {
	writeScientificErrorVersion(w, status, code, message, "skyline-mast-power-response/1.0.0")
}

func writeScientificErrorVersion(w http.ResponseWriter, status int, code, message, version string) {
	state := "failed"
	if status == http.StatusServiceUnavailable || status == http.StatusBadGateway {
		state = "unavailable"
	}
	response := scientificContractEnvelope{
		SchemaVersion: version, DataState: state,
		Units: scientificContractUnits{"deg", "m", "s", "fraction", "UTC ISO 8601"},
		Error: &scientificContractError{Code: code, Message: message},
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(response)
}

func writeMastPlacementError(w http.ResponseWriter, status int, code, message string) {
	writeScientificErrorVersion(w, status, code, message, "skyline-mast-placement-response/1.0.0")
}
