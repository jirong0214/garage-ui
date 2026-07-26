package auth

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"Noooste/garage-ui/internal/config"
)

func newPersistentSessionService(t *testing.T, dir string) *Service {
	t.Helper()
	svc, err := NewAuthService(&config.AuthConfig{
		JWTKeyPath: filepath.Join(dir, "jwt-key.pem"),
		Sessions: config.SessionConfig{
			DatabasePath:  filepath.Join(dir, "auth-sessions.db"),
			AccessMaxAge:  900,
			RefreshMaxAge: 2592000,
		},
	}, &config.ServerConfig{})
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	return svc
}

func TestDeviceSessionCreateRefreshAndReplayRevokesSession(t *testing.T) {
	svc := newPersistentSessionService(t, t.TempDir())
	defer svc.Close()
	user := &UserInfo{Username: "alice", AuthMethod: "admin"}

	initial, err := svc.CreateDeviceSession(user, "Alice's iPhone", "ios")
	if err != nil {
		t.Fatalf("CreateDeviceSession: %v", err)
	}
	if initial.RefreshToken == "" || initial.AccessToken == "" {
		t.Fatal("expected access and refresh tokens")
	}
	if initial.Session.DeviceName != "Alice's iPhone" || initial.Session.DevicePlatform != "ios" {
		t.Fatalf("session = %+v", initial.Session)
	}
	validated, err := svc.ValidateSessionToken(initial.AccessToken)
	if err != nil {
		t.Fatalf("ValidateSessionToken(initial): %v", err)
	}
	if validated.SessionID != initial.Session.ID {
		t.Fatalf("session id = %q, want %q", validated.SessionID, initial.Session.ID)
	}

	rotated, err := svc.RefreshDeviceSession(initial.RefreshToken)
	if err != nil {
		t.Fatalf("RefreshDeviceSession: %v", err)
	}
	if rotated.RefreshToken == initial.RefreshToken {
		t.Fatal("refresh token was not rotated")
	}

	if _, err := svc.RefreshDeviceSession(initial.RefreshToken); !errors.Is(err, ErrRefreshTokenReused) {
		t.Fatalf("reusing rotated token error = %v, want ErrRefreshTokenReused", err)
	}
	if _, err := svc.ValidateSessionToken(rotated.AccessToken); !errors.Is(err, ErrDeviceSessionRevoked) {
		t.Fatalf("access after replay error = %v, want revoked", err)
	}
	if _, err := svc.RefreshDeviceSession(rotated.RefreshToken); !errors.Is(err, ErrDeviceSessionRevoked) {
		t.Fatalf("current refresh after replay error = %v, want revoked", err)
	}
}

func TestDeviceSessionPersistsWithoutRefreshPlaintext(t *testing.T) {
	dir := t.TempDir()
	svc := newPersistentSessionService(t, dir)
	user := &UserInfo{Username: "alice", AuthMethod: "admin"}
	created, err := svc.CreateDeviceSession(user, "Small iPhone", "ios")
	if err != nil {
		t.Fatalf("CreateDeviceSession: %v", err)
	}
	if err := svc.Close(); err != nil {
		t.Fatalf("Close: %v", err)
	}

	dbBytes, err := os.ReadFile(filepath.Join(dir, "auth-sessions.db"))
	if err != nil {
		t.Fatal(err)
	}
	secretPart := strings.Split(created.RefreshToken, ".")[1]
	if bytes.Contains(dbBytes, []byte(created.RefreshToken)) || bytes.Contains(dbBytes, []byte(secretPart)) {
		t.Fatal("refresh token plaintext was persisted")
	}

	reopened := newPersistentSessionService(t, dir)
	defer reopened.Close()
	if _, err := reopened.RefreshDeviceSession(created.RefreshToken); err != nil {
		t.Fatalf("refresh after reopen: %v", err)
	}
}

func TestRefreshReplayDetectionPersistsAcrossRestart(t *testing.T) {
	dir := t.TempDir()
	svc := newPersistentSessionService(t, dir)
	user := &UserInfo{Username: "alice", AuthMethod: "admin"}
	initial, err := svc.CreateDeviceSession(user, "Phone", "ios")
	if err != nil {
		t.Fatal(err)
	}
	rotated, err := svc.RefreshDeviceSession(initial.RefreshToken)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.Close(); err != nil {
		t.Fatal(err)
	}

	reopened := newPersistentSessionService(t, dir)
	defer reopened.Close()
	if _, err := reopened.RefreshDeviceSession(initial.RefreshToken); !errors.Is(err, ErrRefreshTokenReused) {
		t.Fatalf("replay after reopen error = %v", err)
	}
	if _, err := reopened.RefreshDeviceSession(rotated.RefreshToken); !errors.Is(err, ErrDeviceSessionRevoked) {
		t.Fatalf("current token after persisted replay error = %v", err)
	}
}

func TestDeviceSessionIsolationAndRevokeAll(t *testing.T) {
	svc := newPersistentSessionService(t, t.TempDir())
	defer svc.Close()
	alice := &UserInfo{Username: "alice", AuthMethod: "admin"}
	bob := &UserInfo{Username: "bob", AuthMethod: "admin"}
	first, _ := svc.CreateDeviceSession(alice, "Phone", "ios")
	second, _ := svc.CreateDeviceSession(alice, "Tablet", "ios")

	if err := svc.RevokeDeviceSession(bob, first.Session.ID); !errors.Is(err, ErrDeviceSessionForbidden) {
		t.Fatalf("cross-user revoke error = %v", err)
	}
	count, err := svc.RevokeAllDeviceSessions(alice)
	if err != nil || count != 2 {
		t.Fatalf("RevokeAllDeviceSessions = (%d, %v), want (2, nil)", count, err)
	}
	for _, token := range []string{first.AccessToken, second.AccessToken} {
		if _, err := svc.ValidateSessionToken(token); !errors.Is(err, ErrDeviceSessionRevoked) {
			t.Fatalf("revoked access error = %v", err)
		}
	}
}

func TestParseRefreshTokenRejectsMalformedValues(t *testing.T) {
	for _, token := range []string{"", "x", "not-a-uuid.secret", "00000000-0000-0000-0000-000000000000.short", "a.b.c"} {
		if _, _, err := parseRefreshToken(token); !errors.Is(err, ErrInvalidRefreshToken) {
			t.Errorf("parseRefreshToken(%q) error = %v", token, err)
		}
	}
}

func TestDeviceSessionListPrunesExpiredRecords(t *testing.T) {
	svc := newPersistentSessionService(t, t.TempDir())
	defer svc.Close()
	user := &UserInfo{Username: "alice", AuthMethod: "admin"}
	expired := DeviceSession{
		ID:               "expired",
		User:             identityCopy(user),
		DeviceName:       "Old phone",
		CreatedAt:        time.Now().Add(-48 * time.Hour),
		LastUsedAt:       time.Now().Add(-48 * time.Hour),
		ExpiresAt:        time.Now().Add(-24 * time.Hour),
		CurrentTokenHash: strings.Repeat("0", 64),
	}
	if err := svc.sessionStore.create(expired); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.ListDeviceSessions(user); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.sessionStore.get(expired.ID); !errors.Is(err, ErrDeviceSessionNotFound) {
		t.Fatalf("expired record remains: %v", err)
	}
}

func TestLegacyAccessOnlyTokenRemainsStateless(t *testing.T) {
	svc := newPersistentSessionService(t, t.TempDir())
	defer svc.Close()
	user := &UserInfo{Username: "admin", AuthMethod: "admin"}
	token, err := svc.GenerateSessionToken(user)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RevokeAllDeviceSessions(user); err != nil {
		t.Fatal(err)
	}
	validated, err := svc.ValidateSessionToken(token)
	if err != nil {
		t.Fatalf("legacy token should remain valid: %v", err)
	}
	if validated.SessionID != "" {
		t.Fatalf("legacy token has session id %q", validated.SessionID)
	}
}
