package settings

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPublicURLServiceResolveAndPersist(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	service, err := NewPublicURLService(path, "https://{bucket}.example.com/", map[string]string{
		"legacy": "https://cdn.example.com/files/",
	})
	if err != nil {
		t.Fatal(err)
	}

	if got := service.Resolve("photos"); got != "https://photos.example.com" {
		t.Fatalf("Resolve photos = %q", got)
	}
	if got := service.Resolve("legacy"); got != "https://cdn.example.com/files" {
		t.Fatalf("Resolve legacy = %q", got)
	}

	if _, err := service.SetBucket("private", "disabled", ""); err != nil {
		t.Fatal(err)
	}
	if _, err := service.SetBucket("custom", "custom", "https://assets.example.com/base/"); err != nil {
		t.Fatal(err)
	}

	reloaded, err := NewPublicURLService(path, "https://ignored.example.com/{bucket}", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := reloaded.Resolve("private"); got != "" {
		t.Fatalf("disabled bucket resolved to %q", got)
	}
	if got := reloaded.Resolve("custom"); got != "https://assets.example.com/base" {
		t.Fatalf("custom bucket resolved to %q", got)
	}
	if mode := reloaded.GetBucket("photos").Mode; mode != "inherit" {
		t.Fatalf("photos mode = %q", mode)
	}

	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("settings permissions = %o", info.Mode().Perm())
	}
}

func TestPublicURLServiceValidation(t *testing.T) {
	tests := []PublicURLConfig{
		{Template: "https://example.com"},
		{Template: "https://{bucket}.{bucket}.example.com"},
		{Template: "javascript://{bucket}.example.com"},
		{Template: "https://{bucket}.example.com?token=x"},
		{Overrides: map[string]string{"photos": "file:///tmp/photos"}},
	}
	for _, test := range tests {
		if _, err := NewPublicURLService("", test.Template, test.Overrides); err == nil {
			t.Fatalf("expected validation error for %+v", test)
		}
	}
}

func TestPublicURLServiceStoredConfigTakesPrecedence(t *testing.T) {
	path := filepath.Join(t.TempDir(), "settings.json")
	if err := os.WriteFile(path, []byte(`{"template":"https://{bucket}.stored.example","overrides":{}}`), 0o600); err != nil {
		t.Fatal(err)
	}
	service, err := NewPublicURLService(path, "https://{bucket}.seed.example", nil)
	if err != nil {
		t.Fatal(err)
	}
	if got := service.Resolve("photos"); got != "https://photos.stored.example" {
		t.Fatalf("Resolve = %q", got)
	}
}
