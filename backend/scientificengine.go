package main

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"mime"
	"net/http"
	"strings"
)

// The scientific contract has its own version and preserves scientific error bodies.
func registerScientificEngine(mux *http.ServeMux, cfg config, client *http.Client, logger *slog.Logger) {
	mux.HandleFunc("POST /api/scientificengine", func(w http.ResponseWriter, r *http.Request) {
		if cfg.scientificEngineURL == "" {
			writeError(w, http.StatusServiceUnavailable, "scientificengine_not_configured", "Set SCIENTIFIC_ENGINE_URL to the scientific service.")
			return
		}
		mediaType, _, err := mime.ParseMediaType(r.Header.Get("Content-Type"))
		if err != nil || mediaType != "application/json" {
			writeError(w, http.StatusUnsupportedMediaType, "unsupported_media_type", "Content-Type must be application/json.")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
		var payload struct {
			Input json.RawMessage `json:"input"`
		}
		decoder := json.NewDecoder(r.Body)
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&payload); err != nil {
			writeDecodeError(w, err)
			return
		}
		if !isJSONObject(payload.Input) {
			writeError(w, http.StatusBadRequest, "invalid_request", "input must be a scientific request object.")
			return
		}
		var trailing any
		if decoder.Decode(&trailing) != io.EOF {
			writeError(w, http.StatusBadRequest, "invalid_request", "Send exactly one JSON request.")
			return
		}
		body, err := json.Marshal(payload)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_request", "Invalid scientific JSON request.")
			return
		}
		ctx, cancel := context.WithTimeout(r.Context(), cfg.requestTimeout)
		defer cancel()
		req, err := http.NewRequestWithContext(ctx, http.MethodPost, cfg.scientificEngineURL+"/analyze", strings.NewReader(string(body)))
		if err != nil {
			writeError(w, http.StatusServiceUnavailable, "scientificengine_not_configured", "Invalid scientific service URL.")
			return
		}
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-Request-ID", requestIDFromContext(r.Context()))
		response, err := client.Do(req)
		if err != nil {
			logger.ErrorContext(ctx, "Scientific request failed", "request_id", requestIDFromContext(r.Context()), "error", err)
			writeDownstreamError(w, err, "scientificengine")
			return
		}
		defer response.Body.Close()
		result, err := io.ReadAll(io.LimitReader(response.Body, (1<<20)+1))
		if err != nil || len(result) > 1<<20 || !isJSONObject(result) || response.StatusCode < 200 || response.StatusCode >= 600 || (response.StatusCode >= 300 && response.StatusCode < 400) {
			writeError(w, http.StatusBadGateway, "scientificengine_invalid_response", "Scientific service returned an unsupported response.")
			return
		}
		writeJSON(w, response.StatusCode, json.RawMessage(result))
	})
}
