package services

import (
	"bytes"
	"context"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"io"
	"sync"
	"testing"
	"time"

	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"

	"golang.org/x/image/bmp"
	"golang.org/x/image/tiff"
)

type thumbnailStoreStub struct {
	data     []byte
	metadata func(key string) *models.ObjectInfo

	mu        sync.Mutex
	getCalls  int
	active    int
	maxActive int
	started   chan struct{}
	release   chan struct{}
}

func (s *thumbnailStoreStub) GetObjectMetadata(_ context.Context, _, key string) (*models.ObjectInfo, error) {
	return s.metadata(key), nil
}

func (s *thumbnailStoreStub) GetObject(_ context.Context, _, key string) (io.ReadCloser, *models.ObjectInfo, error) {
	s.mu.Lock()
	s.getCalls++
	s.active++
	if s.active > s.maxActive {
		s.maxActive = s.active
	}
	s.mu.Unlock()
	if s.started != nil {
		s.started <- struct{}{}
	}
	if s.release != nil {
		<-s.release
	}
	s.mu.Lock()
	s.active--
	s.mu.Unlock()
	return io.NopCloser(bytes.NewReader(s.data)), s.metadata(key), nil
}

func thumbnailTestConfig(t *testing.T) config.ThumbnailConfig {
	t.Helper()
	return config.ThumbnailConfig{
		Enabled:       true,
		CacheDir:      t.TempDir(),
		Concurrency:   4,
		MaxPixels:     50_000_000,
		MaxSourceSize: 50 * 1024 * 1024,
		CacheMaxSize:  2 * 1024 * 1024 * 1024,
		CacheMaxAge:   30 * 24 * time.Hour,
	}
}

func encodedTestPNG(t *testing.T, width, height int) []byte {
	t.Helper()
	img := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x), G: uint8(y), B: 120, A: 255})
		}
	}
	var buffer bytes.Buffer
	if err := png.Encode(&buffer, img); err != nil {
		t.Fatalf("encode test PNG: %v", err)
	}
	return buffer.Bytes()
}

func TestThumbnailService_GeneratesAndReusesDiskCache(t *testing.T) {
	data := encodedTestPNG(t, 320, 180)
	store := &thumbnailStoreStub{
		data: data,
		metadata: func(key string) *models.ObjectInfo {
			return &models.ObjectInfo{Key: key, Size: int64(len(data)), ETag: "etag-1", ContentType: "image/png"}
		},
	}
	service, err := NewThumbnailService(store, thumbnailTestConfig(t))
	if err != nil {
		t.Fatalf("NewThumbnailService: %v", err)
	}

	first, err := service.Get(context.Background(), "photos", "wide.png", 96)
	if err != nil {
		t.Fatalf("first Get: %v", err)
	}
	second, err := service.Get(context.Background(), "photos", "wide.png", 96)
	if err != nil {
		t.Fatalf("second Get: %v", err)
	}
	if first.ETag != second.ETag || !bytes.Equal(first.Data, second.Data) {
		t.Fatal("cached result differs from generated result")
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.getCalls != 1 {
		t.Fatalf("GetObject calls = %d, want 1", store.getCalls)
	}

	decoded, err := png.Decode(bytes.NewReader(first.Data))
	if err != nil {
		t.Fatalf("decode thumbnail: %v", err)
	}
	if got := decoded.Bounds().Size(); got.X != 96 || got.Y != 54 {
		t.Fatalf("thumbnail size = %v, want 96x54", got)
	}
}

func TestThumbnailService_RejectsImagesAbovePixelLimit(t *testing.T) {
	data := encodedTestPNG(t, 20, 20)
	store := &thumbnailStoreStub{
		data: data,
		metadata: func(key string) *models.ObjectInfo {
			return &models.ObjectInfo{Key: key, Size: int64(len(data)), ETag: "etag-large"}
		},
	}
	cfg := thumbnailTestConfig(t)
	cfg.MaxPixels = 399
	service, err := NewThumbnailService(store, cfg)
	if err != nil {
		t.Fatalf("NewThumbnailService: %v", err)
	}
	if _, err := service.Get(context.Background(), "photos", "large.png", 96); err != ErrThumbnailTooManyPixels {
		t.Fatalf("Get error = %v, want ErrThumbnailTooManyPixels", err)
	}
}

func TestThumbnailService_SupportsWebPBMPTIFF(t *testing.T) {
	img := image.NewNRGBA(image.Rect(0, 0, 20, 12))
	for y := 0; y < 12; y++ {
		for x := 0; x < 20; x++ {
			img.Set(x, y, color.NRGBA{R: uint8(x * 10), G: uint8(y * 15), B: 120, A: 255})
		}
	}
	encode := func(fn func(io.Writer, image.Image) error) []byte {
		var buffer bytes.Buffer
		if err := fn(&buffer, img); err != nil {
			t.Fatalf("encode fixture: %v", err)
		}
		return buffer.Bytes()
	}
	webpData, err := base64.StdEncoding.DecodeString("UklGRrIBAABXRUJQVlA4TKUBAAAvSsAYAA8w//M///MfeJAkbXvaSG7m8Q3GfYSBJekwQztm/IcZlgwnmWImn2BK7aFmBtnVir6q//8VOkFE/xm4baTIu8c48ArEo6+B3zFKYln3pqClSCKX0begFTAXFOLXHSyF8cCNcZEG4OywuA4KVVfJCiArU7GAgJI8+lJP/OKMT/fBAjevg1cYB7YVkFuWga2lyPi5I0HFy5YTpWIHg0RZpkniRVW9odHAKOwosWuOGdxIyn2OvaCDvhg/we6TwadPBPbqBV58MsLmMJ8yZnOWk8SRz4N+QoyPL+MnamzMvcE1rHNEr91F9GKZPVUcS9w7PhhH36suB9qPeYb/oLk6cuTiJ0wOK3m5h1cKjW6EVZCYMK7dxcKCBdgP9HkKr9gkAO2P8GKZGWVdIAatQa+1IDpt6qyorVwdy01xdW8Jkfk6xjEXmVQQ+HQdFr6OKhIN34dXWq0+0qr6EJSCeeVLH9+gvGTLyqM65PQ44ihzlTXxQKjKbAvshXgir7Lil9w4L2bvMycmjQcqXaMCO6BlY28i+FOLzbfI1vEqxAhotocAAA==")
	if err != nil {
		t.Fatalf("decode WebP fixture: %v", err)
	}

	cases := map[string][]byte{
		"image.webp": webpData,
		"image.bmp": encode(func(w io.Writer, source image.Image) error {
			return bmp.Encode(w, source)
		}),
		"image.tiff": encode(func(w io.Writer, source image.Image) error {
			return tiff.Encode(w, source, nil)
		}),
	}
	for key, data := range cases {
		t.Run(key, func(t *testing.T) {
			store := &thumbnailStoreStub{
				data: data,
				metadata: func(key string) *models.ObjectInfo {
					return &models.ObjectInfo{Key: key, Size: int64(len(data)), ETag: "etag-" + key}
				},
			}
			service, err := NewThumbnailService(store, thumbnailTestConfig(t))
			if err != nil {
				t.Fatalf("NewThumbnailService: %v", err)
			}
			result, err := service.Get(context.Background(), "photos", key, 96)
			if err != nil {
				t.Fatalf("Get: %v", err)
			}
			if _, err := png.Decode(bytes.NewReader(result.Data)); err != nil {
				t.Fatalf("thumbnail is not PNG: %v", err)
			}
		})
	}
}

func TestThumbnailService_LimitsConcurrentGeneration(t *testing.T) {
	data := encodedTestPNG(t, 20, 20)
	store := &thumbnailStoreStub{
		data:    data,
		started: make(chan struct{}, 8),
		release: make(chan struct{}, 8),
		metadata: func(key string) *models.ObjectInfo {
			return &models.ObjectInfo{Key: key, Size: int64(len(data)), ETag: "etag-" + key}
		},
	}
	service, err := NewThumbnailService(store, thumbnailTestConfig(t))
	if err != nil {
		t.Fatalf("NewThumbnailService: %v", err)
	}

	const requests = 6
	errorsCh := make(chan error, requests)
	for i := 0; i < requests; i++ {
		go func(key string) {
			_, err := service.Get(context.Background(), "photos", key, 96)
			errorsCh <- err
		}(string(rune('a'+i)) + ".png")
	}
	for i := 0; i < 4; i++ {
		select {
		case <-store.started:
		case <-time.After(time.Second):
			t.Fatal("timed out waiting for four generators")
		}
	}
	select {
	case <-store.started:
		t.Fatal("a fifth generator started before capacity was released")
	case <-time.After(50 * time.Millisecond):
	}
	for i := 0; i < requests; i++ {
		store.release <- struct{}{}
	}
	for i := 0; i < requests; i++ {
		if err := <-errorsCh; err != nil {
			t.Fatalf("Get: %v", err)
		}
	}
	store.mu.Lock()
	defer store.mu.Unlock()
	if store.maxActive != 4 {
		t.Fatalf("max active generators = %d, want 4", store.maxActive)
	}
}
