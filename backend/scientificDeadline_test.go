package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type deadlineProbe struct {
	*httptest.ResponseRecorder
	deadline time.Time
}

func (probe *deadlineProbe) SetWriteDeadline(value time.Time) error {
	probe.deadline = value
	return nil
}
func TestLoggingWrapperPreservesScientificDeadline(t *testing.T) {
	probe := &deadlineProbe{ResponseRecorder: httptest.NewRecorder()}
	wrapped := &statusRecorder{ResponseWriter: probe}
	expected := time.Now().Add(time.Minute)
	if err := http.NewResponseController(wrapped).SetWriteDeadline(expected); err != nil {
		t.Fatal(err)
	}
	if !probe.deadline.Equal(expected) {
		t.Fatal("scientific route deadline did not reach connection")
	}
}
