package services

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	"image/png"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"sync"
	"time"

	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"

	_ "golang.org/x/image/bmp"
	"golang.org/x/image/draw"
	_ "golang.org/x/image/tiff"
	_ "golang.org/x/image/webp"
	"golang.org/x/sync/singleflight"
)

var (
	ErrThumbnailUnsupported    = errors.New("unsupported thumbnail source")
	ErrThumbnailTooManyPixels  = errors.New("image exceeds thumbnail pixel limit")
	ErrThumbnailSourceTooLarge = errors.New("object exceeds thumbnail source size limit")
)

const thumbnailGeneratorVersion = "v1"

type thumbnailObjectStore interface {
	GetObject(ctx context.Context, bucketName, key string) (io.ReadCloser, *models.ObjectInfo, error)
	GetObjectMetadata(ctx context.Context, bucketName, key string) (*models.ObjectInfo, error)
}

// ThumbnailResult is a cached PNG thumbnail and its stable response ETag.
type ThumbnailResult struct {
	Data []byte
	ETag string
}

// ThumbnailService generates thumbnails on demand, limits expensive work and
// stores results on disk. Cache identity includes the source object's ETag, so
// replacing an object cannot overwrite or reuse its previous thumbnail.
type ThumbnailService struct {
	store thumbnailObjectStore
	cfg   config.ThumbnailConfig
	sem   chan struct{}
	group singleflight.Group

	cleanupMu   sync.Mutex
	lastCleanup time.Time
}

func NewThumbnailService(store thumbnailObjectStore, cfg config.ThumbnailConfig) (*ThumbnailService, error) {
	if err := os.MkdirAll(cfg.CacheDir, 0o700); err != nil {
		return nil, fmt.Errorf("create thumbnail cache directory: %w", err)
	}
	return &ThumbnailService{
		store: store,
		cfg:   cfg,
		sem:   make(chan struct{}, cfg.Concurrency),
	}, nil
}

// Get returns a cached thumbnail or generates it. Size is the maximum width
// and height of the output; aspect ratio is preserved and images are not
// upscaled.
func (s *ThumbnailService) Get(ctx context.Context, bucket, key string, size int) (*ThumbnailResult, error) {
	metadata, err := s.store.GetObjectMetadata(ctx, bucket, key)
	if err != nil {
		return nil, fmt.Errorf("get thumbnail source metadata: %w", err)
	}
	if metadata.Size > s.cfg.MaxSourceSize {
		return nil, ErrThumbnailSourceTooLarge
	}

	cacheKey := thumbnailCacheKey(bucket, key, metadata.ETag, size)
	if result, err := s.readCache(cacheKey); err == nil {
		s.maybeCleanup()
		return result, nil
	}

	resultCh := s.group.DoChan(cacheKey, func() (any, error) {
		if result, err := s.readCache(cacheKey); err == nil {
			return result, nil
		}

		select {
		case s.sem <- struct{}{}:
			defer func() { <-s.sem }()
		case <-ctx.Done():
			return nil, ctx.Err()
		}

		return s.generate(ctx, bucket, key, size)
	})

	select {
	case result := <-resultCh:
		if result.Err != nil {
			return nil, result.Err
		}
		s.maybeCleanup()
		return result.Val.(*ThumbnailResult), nil
	case <-ctx.Done():
		return nil, ctx.Err()
	}
}

func (s *ThumbnailService) generate(ctx context.Context, bucket, key string, size int) (*ThumbnailResult, error) {
	body, info, err := s.store.GetObject(ctx, bucket, key)
	if err != nil {
		return nil, fmt.Errorf("get thumbnail source: %w", err)
	}
	defer body.Close()

	if info.Size > s.cfg.MaxSourceSize {
		return nil, ErrThumbnailSourceTooLarge
	}
	data, err := io.ReadAll(io.LimitReader(body, s.cfg.MaxSourceSize+1))
	if err != nil {
		return nil, fmt.Errorf("read thumbnail source: %w", err)
	}
	if int64(len(data)) > s.cfg.MaxSourceSize {
		return nil, ErrThumbnailSourceTooLarge
	}

	decodedConfig, _, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || decodedConfig.Width <= 0 || decodedConfig.Height <= 0 {
		return nil, ErrThumbnailUnsupported
	}
	if int64(decodedConfig.Width) > s.cfg.MaxPixels/int64(decodedConfig.Height) {
		return nil, ErrThumbnailTooManyPixels
	}

	source, _, err := image.Decode(bytes.NewReader(data))
	if err != nil {
		return nil, ErrThumbnailUnsupported
	}
	width, height := thumbnailDimensions(source.Bounds().Dx(), source.Bounds().Dy(), size)
	destination := image.NewNRGBA(image.Rect(0, 0, width, height))
	draw.ApproxBiLinear.Scale(destination, destination.Bounds(), source, source.Bounds(), draw.Over, nil)

	var encoded bytes.Buffer
	encoder := png.Encoder{CompressionLevel: png.BestSpeed}
	if err := encoder.Encode(&encoded, destination); err != nil {
		return nil, fmt.Errorf("encode thumbnail: %w", err)
	}

	cacheKey := thumbnailCacheKey(bucket, key, info.ETag, size)
	result := &ThumbnailResult{Data: encoded.Bytes(), ETag: cacheKey}
	if err := s.writeCache(cacheKey, result.Data); err != nil {
		return nil, err
	}
	return result, nil
}

func thumbnailDimensions(width, height, maxSize int) (int, int) {
	if width <= maxSize && height <= maxSize {
		return width, height
	}
	if width >= height {
		return maxSize, max(1, int(float64(height)*float64(maxSize)/float64(width)))
	}
	return max(1, int(float64(width)*float64(maxSize)/float64(height))), maxSize
}

func thumbnailCacheKey(bucket, key, etag string, size int) string {
	value := thumbnailGeneratorVersion + "\x00" + bucket + "\x00" + key + "\x00" + etag + "\x00" + strconv.Itoa(size)
	sum := sha256.Sum256([]byte(value))
	return hex.EncodeToString(sum[:])
}

func (s *ThumbnailService) cachePath(cacheKey string) string {
	return filepath.Join(s.cfg.CacheDir, cacheKey[:2], cacheKey[2:4], cacheKey+".png")
}

func (s *ThumbnailService) readCache(cacheKey string) (*ThumbnailResult, error) {
	path := s.cachePath(cacheKey)
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	now := time.Now()
	_ = os.Chtimes(path, now, now)
	return &ThumbnailResult{Data: data, ETag: cacheKey}, nil
}

func (s *ThumbnailService) writeCache(cacheKey string, data []byte) error {
	path := s.cachePath(cacheKey)
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return fmt.Errorf("create thumbnail cache shard: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(path), ".thumbnail-*.tmp")
	if err != nil {
		return fmt.Errorf("create thumbnail cache file: %w", err)
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := tmp.Write(data); err != nil {
		tmp.Close()
		return fmt.Errorf("write thumbnail cache file: %w", err)
	}
	if err := tmp.Close(); err != nil {
		return fmt.Errorf("close thumbnail cache file: %w", err)
	}
	if err := os.Rename(tmpPath, path); err != nil {
		return fmt.Errorf("publish thumbnail cache file: %w", err)
	}
	return nil
}

func (s *ThumbnailService) maybeCleanup() {
	s.cleanupMu.Lock()
	if time.Since(s.lastCleanup) < time.Hour {
		s.cleanupMu.Unlock()
		return
	}
	s.lastCleanup = time.Now()
	s.cleanupMu.Unlock()
	go s.cleanup()
}

type thumbnailCacheEntry struct {
	path    string
	size    int64
	modTime time.Time
}

func (s *ThumbnailService) cleanup() {
	now := time.Now()
	entries := make([]thumbnailCacheEntry, 0)
	var total int64
	_ = filepath.WalkDir(s.cfg.CacheDir, func(path string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil || entry.IsDir() {
			return nil
		}
		info, err := entry.Info()
		if err != nil {
			return nil
		}
		if filepath.Ext(path) == ".tmp" {
			if now.Sub(info.ModTime()) > time.Hour {
				_ = os.Remove(path)
			}
			return nil
		}
		if now.Sub(info.ModTime()) > s.cfg.CacheMaxAge {
			_ = os.Remove(path)
			return nil
		}
		if filepath.Ext(path) != ".png" {
			return nil
		}
		entries = append(entries, thumbnailCacheEntry{path: path, size: info.Size(), modTime: info.ModTime()})
		total += info.Size()
		return nil
	})
	if total <= s.cfg.CacheMaxSize {
		return
	}
	sort.Slice(entries, func(i, j int) bool { return entries[i].modTime.Before(entries[j].modTime) })
	for _, entry := range entries {
		if total <= s.cfg.CacheMaxSize {
			break
		}
		if os.Remove(entry.path) == nil {
			total -= entry.size
		}
	}
}
