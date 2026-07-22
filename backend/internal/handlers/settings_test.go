package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	appsettings "Noooste/garage-ui/internal/settings"

	"github.com/gofiber/fiber/v3"
)

func newSettingsTestApp(t *testing.T) *fiber.App {
	t.Helper()
	service, err := appsettings.NewPublicURLService(
		filepath.Join(t.TempDir(), "public-urls.json"),
		"https://{bucket}.example.com",
		nil,
	)
	if err != nil {
		t.Fatal(err)
	}
	handler := NewSettingsHandler(service)
	app := fiber.New()
	app.Get("/settings/public-urls", handler.GetPublicURLs)
	app.Put("/settings/public-urls", handler.UpdatePublicURLs)
	app.Get("/buckets/:name/public-url", handler.GetBucketPublicURL)
	app.Put("/buckets/:name/public-url", handler.UpdateBucketPublicURL)
	return app
}

func TestSettingsHandlerUpdatesTemplateAndBucketOverride(t *testing.T) {
	app := newSettingsTestApp(t)

	request := httptest.NewRequest(http.MethodPut, "/settings/public-urls", bytes.NewBufferString(
		`{"template":"https://{bucket}.storage.example","overrides":{}}`,
	))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("template update status = %d", response.StatusCode)
	}

	request = httptest.NewRequest(http.MethodPut, "/buckets/photos/public-url", bytes.NewBufferString(
		`{"mode":"custom","url":"https://cdn.example.com/photos/"}`,
	))
	request.Header.Set("Content-Type", "application/json")
	response, err = app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("bucket update status = %d", response.StatusCode)
	}

	var body struct {
		Data appsettings.BucketPublicURL `json:"data"`
	}
	if err := json.NewDecoder(response.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Data.Mode != "custom" || body.Data.EffectiveURL != "https://cdn.example.com/photos" {
		t.Fatalf("bucket response = %+v", body.Data)
	}
}

func TestSettingsHandlerRejectsInvalidTemplate(t *testing.T) {
	app := newSettingsTestApp(t)
	request := httptest.NewRequest(http.MethodPut, "/settings/public-urls", bytes.NewBufferString(
		`{"template":"https://example.com","overrides":{}}`,
	))
	request.Header.Set("Content-Type", "application/json")
	response, err := app.Test(request)
	if err != nil {
		t.Fatal(err)
	}
	if response.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", response.StatusCode)
	}
}
