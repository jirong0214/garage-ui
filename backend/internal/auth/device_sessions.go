package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	bolt "go.etcd.io/bbolt"
)

const refreshSecretSize = 32

var (
	ErrInvalidRefreshToken    = errors.New("invalid refresh token")
	ErrRefreshTokenReused     = errors.New("refresh token reuse detected")
	ErrDeviceSessionExpired   = errors.New("device session expired")
	ErrDeviceSessionRevoked   = errors.New("device session revoked")
	ErrDeviceSessionNotFound  = errors.New("device session not found")
	ErrDeviceSessionForbidden = errors.New("device session belongs to another user")
)

var deviceSessionsBucket = []byte("device_sessions")

// DeviceSession is the server-side representation of one long-lived device
// login. Refresh token plaintext is never stored: CurrentTokenHash and
// UsedTokenHashes contain SHA-256 hashes of 256-bit random secrets.
type DeviceSession struct {
	ID               string     `json:"id"`
	User             UserInfo   `json:"user"`
	DeviceName       string     `json:"device_name"`
	DevicePlatform   string     `json:"device_platform,omitempty"`
	CreatedAt        time.Time  `json:"created_at"`
	LastUsedAt       time.Time  `json:"last_used_at"`
	ExpiresAt        time.Time  `json:"expires_at"`
	RevokedAt        *time.Time `json:"revoked_at,omitempty"`
	RevocationReason string     `json:"revocation_reason,omitempty"`
	CurrentTokenHash string     `json:"current_token_hash"`
	UsedTokenHashes  []string   `json:"used_token_hashes,omitempty"`
}

// DeviceSessionInfo is safe to return to clients.
type DeviceSessionInfo struct {
	ID             string     `json:"id"`
	DeviceName     string     `json:"device_name"`
	DevicePlatform string     `json:"device_platform,omitempty"`
	CreatedAt      time.Time  `json:"created_at"`
	LastUsedAt     time.Time  `json:"last_used_at"`
	ExpiresAt      time.Time  `json:"expires_at"`
	RevokedAt      *time.Time `json:"revoked_at,omitempty"`
	Current        bool       `json:"current"`
}

func (s *DeviceSession) Info(currentSessionID string) DeviceSessionInfo {
	return DeviceSessionInfo{
		ID:             s.ID,
		DeviceName:     s.DeviceName,
		DevicePlatform: s.DevicePlatform,
		CreatedAt:      s.CreatedAt,
		LastUsedAt:     s.LastUsedAt,
		ExpiresAt:      s.ExpiresAt,
		RevokedAt:      s.RevokedAt,
		Current:        s.ID == currentSessionID,
	}
}

type deviceSessionStore struct {
	db  *bolt.DB
	mu  sync.Mutex
	mem map[string]DeviceSession
}

func openDeviceSessionStore(path string) (*deviceSessionStore, error) {
	if strings.TrimSpace(path) == "" {
		return &deviceSessionStore{mem: make(map[string]DeviceSession)}, nil
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create device session directory: %w", err)
	}
	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open device session database: %w", err)
	}
	if err := db.Update(func(tx *bolt.Tx) error {
		_, err := tx.CreateBucketIfNotExists(deviceSessionsBucket)
		return err
	}); err != nil {
		db.Close()
		return nil, fmt.Errorf("initialize device session database: %w", err)
	}
	return &deviceSessionStore{db: db}, nil
}

func (s *deviceSessionStore) Close() error {
	if s == nil || s.db == nil {
		return nil
	}
	return s.db.Close()
}

func (s *deviceSessionStore) create(session DeviceSession) error {
	return s.update(func(sessions map[string]DeviceSession) error {
		pruneExpiredSessions(sessions, session.CreatedAt, "")
		if _, exists := sessions[session.ID]; exists {
			return fmt.Errorf("device session already exists")
		}
		sessions[session.ID] = session
		return nil
	})
}

func (s *deviceSessionStore) get(id string) (*DeviceSession, error) {
	var result *DeviceSession
	err := s.view(func(sessions map[string]DeviceSession) error {
		session, exists := sessions[id]
		if !exists {
			return ErrDeviceSessionNotFound
		}
		copy := session
		result = &copy
		return nil
	})
	return result, err
}

func (s *deviceSessionStore) rotate(id, presentedHash, replacementHash string, now time.Time) (*DeviceSession, error) {
	var result *DeviceSession
	err := s.update(func(sessions map[string]DeviceSession) error {
		session, exists := sessions[id]
		if !exists {
			return ErrInvalidRefreshToken
		}
		if session.RevokedAt != nil {
			return ErrDeviceSessionRevoked
		}
		if !now.Before(session.ExpiresAt) {
			session.RevokedAt = timePtr(now)
			session.RevocationReason = "expired"
			sessions[id] = session
			return ErrDeviceSessionExpired
		}
		if !equalTokenHash(presentedHash, session.CurrentTokenHash) {
			for _, usedHash := range session.UsedTokenHashes {
				if equalTokenHash(presentedHash, usedHash) {
					session.RevokedAt = timePtr(now)
					session.RevocationReason = "refresh_token_reuse"
					sessions[id] = session
					return ErrRefreshTokenReused
				}
			}
			return ErrInvalidRefreshToken
		}
		session.UsedTokenHashes = append(session.UsedTokenHashes, session.CurrentTokenHash)
		session.CurrentTokenHash = replacementHash
		session.LastUsedAt = now
		sessions[id] = session
		copy := session
		result = &copy
		return nil
	})
	return result, err
}

func (s *deviceSessionStore) listForUser(user *UserInfo, now time.Time) ([]DeviceSession, error) {
	sessions := make([]DeviceSession, 0)
	err := s.update(func(all map[string]DeviceSession) error {
		pruneExpiredSessions(all, now, "")
		for _, session := range all {
			if sameIdentity(&session.User, user) {
				sessions = append(sessions, session)
			}
		}
		return nil
	})
	return sessions, err
}

func (s *deviceSessionStore) revoke(id string, user *UserInfo, now time.Time, reason string) error {
	return s.update(func(sessions map[string]DeviceSession) error {
		session, exists := sessions[id]
		if !exists {
			return ErrDeviceSessionNotFound
		}
		if !sameIdentity(&session.User, user) {
			return ErrDeviceSessionForbidden
		}
		if session.RevokedAt == nil {
			session.RevokedAt = timePtr(now)
			session.RevocationReason = reason
			sessions[id] = session
		}
		return nil
	})
}

func (s *deviceSessionStore) revokeAll(user *UserInfo, now time.Time, reason string) (int, error) {
	count := 0
	err := s.update(func(sessions map[string]DeviceSession) error {
		for id, session := range sessions {
			if sameIdentity(&session.User, user) && session.RevokedAt == nil {
				session.RevokedAt = timePtr(now)
				session.RevocationReason = reason
				sessions[id] = session
				count++
			}
		}
		return nil
	})
	return count, err
}

func (s *deviceSessionStore) activeForUser(id string, user *UserInfo, now time.Time) error {
	session, err := s.get(id)
	if err != nil {
		return err
	}
	if !sameIdentity(&session.User, user) {
		return ErrDeviceSessionForbidden
	}
	if session.RevokedAt != nil {
		return ErrDeviceSessionRevoked
	}
	if !now.Before(session.ExpiresAt) {
		return ErrDeviceSessionExpired
	}
	return nil
}

func (s *deviceSessionStore) view(fn func(map[string]DeviceSession) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return fn(s.mem)
	}
	return s.db.View(func(tx *bolt.Tx) error {
		return fn(decodeSessions(tx.Bucket(deviceSessionsBucket)))
	})
}

func (s *deviceSessionStore) update(fn func(map[string]DeviceSession) error) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.db == nil {
		return fn(s.mem)
	}
	var committedOutcome error
	err := s.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket(deviceSessionsBucket)
		sessions := decodeSessions(bucket)
		if err := fn(sessions); err != nil {
			if errors.Is(err, ErrRefreshTokenReused) || errors.Is(err, ErrDeviceSessionExpired) {
				if persistErr := encodeSessions(bucket, sessions); persistErr != nil {
					return persistErr
				}
				committedOutcome = err
				return nil
			}
			return err
		}
		return encodeSessions(bucket, sessions)
	})
	if err != nil {
		return err
	}
	return committedOutcome
}

func decodeSessions(bucket *bolt.Bucket) map[string]DeviceSession {
	sessions := make(map[string]DeviceSession)
	if bucket == nil {
		return sessions
	}
	_ = bucket.ForEach(func(key, value []byte) error {
		var session DeviceSession
		if json.Unmarshal(value, &session) == nil {
			sessions[string(key)] = session
		}
		return nil
	})
	return sessions
}

func encodeSessions(bucket *bolt.Bucket, sessions map[string]DeviceSession) error {
	if bucket == nil {
		return fmt.Errorf("device sessions bucket missing")
	}
	existing := make([][]byte, 0)
	if err := bucket.ForEach(func(key, _ []byte) error {
		existing = append(existing, append([]byte(nil), key...))
		return nil
	}); err != nil {
		return err
	}
	for _, key := range existing {
		if err := bucket.Delete(key); err != nil {
			return err
		}
	}
	for id, session := range sessions {
		data, err := json.Marshal(session)
		if err != nil {
			return err
		}
		if err := bucket.Put([]byte(id), data); err != nil {
			return err
		}
	}
	return nil
}

func newRefreshToken(sessionID string) (plaintext, hash string, err error) {
	secret := make([]byte, refreshSecretSize)
	if _, err := rand.Read(secret); err != nil {
		return "", "", fmt.Errorf("generate refresh token: %w", err)
	}
	plaintext = sessionID + "." + base64.RawURLEncoding.EncodeToString(secret)
	return plaintext, hashRefreshSecret(secret), nil
}

func parseRefreshToken(token string) (sessionID, hash string, err error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", "", ErrInvalidRefreshToken
	}
	if _, err := uuid.Parse(parts[0]); err != nil {
		return "", "", ErrInvalidRefreshToken
	}
	secret, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(secret) != refreshSecretSize {
		return "", "", ErrInvalidRefreshToken
	}
	return parts[0], hashRefreshSecret(secret), nil
}

func hashRefreshSecret(secret []byte) string {
	sum := sha256.Sum256(secret)
	return hex.EncodeToString(sum[:])
}

func sameIdentity(left, right *UserInfo) bool {
	return left != nil && right != nil &&
		left.Username == right.Username &&
		left.Email == right.Email &&
		left.AuthMethod == right.AuthMethod
}

func timePtr(value time.Time) *time.Time {
	return &value
}

func equalTokenHash(left, right string) bool {
	return len(left) == len(right) &&
		subtle.ConstantTimeCompare([]byte(left), []byte(right)) == 1
}

func pruneExpiredSessions(sessions map[string]DeviceSession, now time.Time, exceptID string) {
	for id, session := range sessions {
		if id != exceptID && !now.Before(session.ExpiresAt) {
			delete(sessions, id)
		}
	}
}
