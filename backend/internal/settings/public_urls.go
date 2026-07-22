package settings

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

const BucketPlaceholder = "{bucket}"

var ErrInvalid = errors.New("invalid public URL settings")

type PublicURLConfig struct {
	Template  string            `json:"template"`
	Overrides map[string]string `json:"overrides"`
}

type BucketPublicURL struct {
	Mode         string `json:"mode"`
	URL          string `json:"url,omitempty"`
	EffectiveURL string `json:"effectiveUrl,omitempty"`
}

type PublicURLResolver interface {
	Resolve(bucket string) string
}

type PublicURLService struct {
	mu     sync.RWMutex
	path   string
	config PublicURLConfig
}

func NewPublicURLService(path, template string, overrides map[string]string) (*PublicURLService, error) {
	seed, err := normalizeConfig(PublicURLConfig{Template: template, Overrides: overrides})
	if err != nil {
		return nil, err
	}

	s := &PublicURLService{path: path, config: seed}
	if path == "" {
		return s, nil
	}

	data, err := os.ReadFile(path)
	if errors.Is(err, os.ErrNotExist) {
		return s, nil
	}
	if err != nil {
		return nil, fmt.Errorf("read public URL settings: %w", err)
	}

	var stored PublicURLConfig
	if err := json.Unmarshal(data, &stored); err != nil {
		return nil, fmt.Errorf("decode public URL settings: %w", err)
	}
	stored, err = normalizeConfig(stored)
	if err != nil {
		return nil, fmt.Errorf("validate public URL settings: %w", err)
	}
	s.config = stored
	return s, nil
}

func (s *PublicURLService) Get() PublicURLConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return cloneConfig(s.config)
}

func (s *PublicURLService) Update(config PublicURLConfig) (PublicURLConfig, error) {
	normalized, err := normalizeConfig(config)
	if err != nil {
		return PublicURLConfig{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if err := s.persist(normalized); err != nil {
		return PublicURLConfig{}, err
	}
	s.config = normalized
	return cloneConfig(s.config), nil
}

func (s *PublicURLService) GetBucket(bucket string) BucketPublicURL {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if value, ok := s.config.Overrides[bucket]; ok {
		if value == "" {
			return BucketPublicURL{Mode: "disabled"}
		}
		return BucketPublicURL{Mode: "custom", URL: value, EffectiveURL: value}
	}

	return BucketPublicURL{Mode: "inherit", EffectiveURL: resolveTemplate(s.config.Template, bucket)}
}

func (s *PublicURLService) SetBucket(bucket, mode, rawURL string) (BucketPublicURL, error) {
	if strings.TrimSpace(bucket) == "" {
		return BucketPublicURL{}, fmt.Errorf("%w: bucket name is required", ErrInvalid)
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	next := cloneConfig(s.config)
	switch mode {
	case "inherit":
		delete(next.Overrides, bucket)
	case "disabled":
		next.Overrides[bucket] = ""
	case "custom":
		normalized, err := normalizeHTTPURL(rawURL)
		if err != nil {
			return BucketPublicURL{}, fmt.Errorf("%w: invalid custom URL: %v", ErrInvalid, err)
		}
		next.Overrides[bucket] = normalized
	default:
		return BucketPublicURL{}, fmt.Errorf("%w: mode must be inherit, custom, or disabled", ErrInvalid)
	}

	if err := s.persist(next); err != nil {
		return BucketPublicURL{}, err
	}
	s.config = next
	return bucketConfig(next, bucket), nil
}

func (s *PublicURLService) Resolve(bucket string) string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return bucketConfig(s.config, bucket).EffectiveURL
}

func (s *PublicURLService) persist(config PublicURLConfig) error {
	if s.path == "" {
		return nil
	}

	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0o750); err != nil {
		return fmt.Errorf("create settings directory: %w", err)
	}

	tmp, err := os.CreateTemp(dir, ".public-urls-*.tmp")
	if err != nil {
		return fmt.Errorf("create settings file: %w", err)
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)

	if err := tmp.Chmod(0o600); err != nil {
		tmp.Close()
		return fmt.Errorf("set settings file permissions: %w", err)
	}
	encoder := json.NewEncoder(tmp)
	encoder.SetIndent("", "  ")
	if err := encoder.Encode(config); err != nil {
		tmp.Close()
		return fmt.Errorf("encode settings: %w", err)
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return fmt.Errorf("sync settings: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close settings file: %w", err)
	}
	if err := os.Rename(tmpName, s.path); err != nil {
		return fmt.Errorf("replace settings file: %w", err)
	}
	return nil
}

func normalizeConfig(config PublicURLConfig) (PublicURLConfig, error) {
	template, err := normalizeTemplate(config.Template)
	if err != nil {
		return PublicURLConfig{}, err
	}

	overrides := make(map[string]string, len(config.Overrides))
	for bucket, rawURL := range config.Overrides {
		bucket = strings.TrimSpace(bucket)
		if bucket == "" {
			return PublicURLConfig{}, errors.New("override bucket name is required")
		}
		if strings.TrimSpace(rawURL) == "" {
			overrides[bucket] = ""
			continue
		}
		normalized, err := normalizeHTTPURL(rawURL)
		if err != nil {
			return PublicURLConfig{}, fmt.Errorf("invalid URL override for %q: %w", bucket, err)
		}
		overrides[bucket] = normalized
	}
	return PublicURLConfig{Template: template, Overrides: overrides}, nil
}

func normalizeTemplate(template string) (string, error) {
	template = strings.TrimSpace(strings.TrimRight(template, "/"))
	if template == "" {
		return "", nil
	}
	if strings.Count(template, BucketPlaceholder) != 1 {
		return "", fmt.Errorf("template must contain %s exactly once", BucketPlaceholder)
	}
	if _, err := normalizeHTTPURL(strings.Replace(template, BucketPlaceholder, "example-bucket", 1)); err != nil {
		return "", fmt.Errorf("invalid template: %w", err)
	}
	return template, nil
}

func normalizeHTTPURL(raw string) (string, error) {
	raw = strings.TrimSpace(strings.TrimRight(raw, "/"))
	parsed, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if parsed.Scheme != "http" && parsed.Scheme != "https" {
		return "", errors.New("scheme must be http or https")
	}
	if parsed.Host == "" {
		return "", errors.New("host is required")
	}
	if parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" {
		return "", errors.New("credentials, query parameters, and fragments are not allowed")
	}
	return raw, nil
}

func bucketConfig(config PublicURLConfig, bucket string) BucketPublicURL {
	if value, ok := config.Overrides[bucket]; ok {
		if value == "" {
			return BucketPublicURL{Mode: "disabled"}
		}
		return BucketPublicURL{Mode: "custom", URL: value, EffectiveURL: value}
	}
	return BucketPublicURL{Mode: "inherit", EffectiveURL: resolveTemplate(config.Template, bucket)}
}

func resolveTemplate(template, bucket string) string {
	if template == "" {
		return ""
	}
	return strings.Replace(template, BucketPlaceholder, bucket, 1)
}

func cloneConfig(config PublicURLConfig) PublicURLConfig {
	overrides := make(map[string]string, len(config.Overrides))
	for bucket, value := range config.Overrides {
		overrides[bucket] = value
	}
	return PublicURLConfig{Template: config.Template, Overrides: overrides}
}
