package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/config"

	"github.com/gofiber/fiber/v3"
)

// newAuthTestService builds a real auth.Service with OIDC disabled. The JWT
// key is auto-generated, matching the production default.
func newAuthTestService(t *testing.T, admin config.AdminAuthConfig) *auth.Service {
	t.Helper()
	svc, err := auth.NewAuthService(
		&config.AuthConfig{
			Admin: admin,
			OIDC:  config.OIDCConfig{Enabled: false},
		},
		&config.ServerConfig{},
	)
	if err != nil {
		t.Fatalf("NewAuthService: %v", err)
	}
	return svc
}

// newAuthTestApp builds a bare Fiber app with the auth handler mounted.
// The admin and OIDC config are reflected both in cfg (for the handler) and
// in the auth service.
func newAuthTestApp(t *testing.T, cfg *config.Config) (*fiber.App, *AuthHandler) {
	t.Helper()
	svc := newAuthTestService(t, cfg.Auth.Admin)
	h := NewAuthHandler(cfg, svc)
	app := fiber.New()
	app.Get("/auth/config", h.GetAuthConfig)
	app.Post("/auth/login", h.LoginAdmin)
	app.Get("/auth/me", h.GetMe)
	return app, h
}

func TestGetAuthConfig_AdminOnly(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{
			Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "p"},
			OIDC:  config.OIDCConfig{Enabled: false},
		},
	}
	app, _ := newAuthTestApp(t, cfg)
	req := httptest.NewRequest(http.MethodGet, "/auth/config", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Admin struct {
			Enabled bool `json:"enabled"`
		} `json:"admin"`
		OIDC struct {
			Enabled  bool   `json:"enabled"`
			Provider string `json:"provider"`
		} `json:"oidc"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.Admin.Enabled {
		t.Error("admin.enabled = false, want true")
	}
	if body.OIDC.Enabled {
		t.Error("oidc.enabled = true, want false")
	}
	if body.OIDC.Provider != "" {
		t.Errorf("oidc.provider = %q, want empty", body.OIDC.Provider)
	}
}

func TestGetAuthConfig_OIDCOnly_WithExplicitProvider(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{
			Admin: config.AdminAuthConfig{Enabled: false},
			OIDC: config.OIDCConfig{
				Enabled:      false, // service init skipped (newAuthTestService disables OIDC); handler only reads flags
				ProviderName: "Keycloak",
			},
		},
	}
	// Re-enable OIDC only on the cfg the handler sees — the service is still
	// constructed with OIDC disabled above, which is fine because
	// GetAuthConfig does not touch the service at all.
	cfg.Auth.OIDC.Enabled = true
	app, _ := newAuthTestApp(t, cfg)

	req := httptest.NewRequest(http.MethodGet, "/auth/config", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		OIDC struct {
			Enabled  bool   `json:"enabled"`
			Provider string `json:"provider"`
		} `json:"oidc"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.OIDC.Enabled {
		t.Error("oidc.enabled = false, want true")
	}
	if body.OIDC.Provider != "Keycloak" {
		t.Errorf("oidc.provider = %q, want Keycloak", body.OIDC.Provider)
	}
}

func TestGetAuthConfig_OIDCEnabled_DefaultProviderName(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{
			Admin: config.AdminAuthConfig{Enabled: false},
			OIDC:  config.OIDCConfig{Enabled: true, ProviderName: ""},
		},
	}
	app, _ := newAuthTestApp(t, cfg)
	req := httptest.NewRequest(http.MethodGet, "/auth/config", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	var body struct {
		OIDC struct {
			Provider string `json:"provider"`
		} `json:"oidc"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&body)
	if body.OIDC.Provider != "OIDC Provider" {
		t.Errorf("provider = %q, want default 'OIDC Provider'", body.OIDC.Provider)
	}
}

func TestLoginAdmin_HappyPath(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{
			Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "s3cret"},
		},
	}
	app, _ := newAuthTestApp(t, cfg)

	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "s3cret"})
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")

	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 200\nbody: %s", resp.StatusCode, raw)
	}

	var decoded struct {
		Success bool   `json:"success"`
		Token   string `json:"token"`
		User    struct {
			Username string `json:"username"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !decoded.Success {
		t.Error("success = false")
	}
	if decoded.Token == "" {
		t.Error("token empty")
	}
	if decoded.User.Username != "admin" {
		t.Errorf("username = %q, want admin", decoded.User.Username)
	}
}

func TestLoginAdmin_WrongPasswordReturns401(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "s3cret"}},
	}
	app, _ := newAuthTestApp(t, cfg)
	body, _ := json.Marshal(map[string]string{"username": "admin", "password": "WRONG"})
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestLoginAdmin_WrongUsernameReturns401(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "s3cret"}},
	}
	app, _ := newAuthTestApp(t, cfg)
	body, _ := json.Marshal(map[string]string{"username": "root", "password": "s3cret"})
	req := httptest.NewRequest(http.MethodPost, "/auth/login", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestLoginAdmin_MalformedJSONReturns400(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{Admin: config.AdminAuthConfig{Enabled: true, Username: "admin", Password: "p"}},
	}
	app, _ := newAuthTestApp(t, cfg)
	req := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader("{not-json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

func TestLoginToken_Success(t *testing.T) {
	cfg := &config.Config{
		Garage: config.GarageConfig{
			AdminToken:    "test-admin-token",
			Endpoint:      "http://g:3900",
			AdminEndpoint: "http://g:3903",
		},
		Auth: config.AuthConfig{
			Token: config.TokenAuthConfig{Enabled: true},
		},
	}
	svc := newAuthTestService(t, cfg.Auth.Admin)
	h := NewAuthHandler(cfg, svc)
	app := fiber.New()
	app.Post("/auth/login-token", h.LoginToken)

	body := `{"token":"test-admin-token"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login-token", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		raw, _ := io.ReadAll(resp.Body)
		t.Fatalf("status = %d, want 200\nbody: %s", resp.StatusCode, raw)
	}

	var decoded struct {
		Success bool   `json:"success"`
		Token   string `json:"token"`
		User    struct {
			Username string `json:"username"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !decoded.Success {
		t.Error("success = false")
	}
	if decoded.Token == "" {
		t.Error("token empty")
	}
	if decoded.User.Username != "admin-token" {
		t.Errorf("username = %q, want admin-token", decoded.User.Username)
	}
}

func TestLoginToken_WrongToken(t *testing.T) {
	cfg := &config.Config{
		Garage: config.GarageConfig{
			AdminToken:    "test-admin-token",
			Endpoint:      "http://g:3900",
			AdminEndpoint: "http://g:3903",
		},
		Auth: config.AuthConfig{
			Token: config.TokenAuthConfig{Enabled: true},
		},
	}
	svc := newAuthTestService(t, cfg.Auth.Admin)
	h := NewAuthHandler(cfg, svc)
	app := fiber.New()
	app.Post("/auth/login-token", h.LoginToken)

	body := `{"token":"wrong-token"}`
	req := httptest.NewRequest(http.MethodPost, "/auth/login-token", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}

func TestLoginToken_MalformedJSONReturns400(t *testing.T) {
	cfg := &config.Config{
		Garage: config.GarageConfig{
			AdminToken:    "test-admin-token",
			Endpoint:      "http://g:3900",
			AdminEndpoint: "http://g:3903",
		},
		Auth: config.AuthConfig{
			Token: config.TokenAuthConfig{Enabled: true},
		},
	}
	svc := newAuthTestService(t, cfg.Auth.Admin)
	h := NewAuthHandler(cfg, svc)
	app := fiber.New()
	app.Post("/auth/login-token", h.LoginToken)

	req := httptest.NewRequest(http.MethodPost, "/auth/login-token", strings.NewReader("{not-json"))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", resp.StatusCode)
	}
}

func TestBootstrapAdminCreatesPersistentCredentials(t *testing.T) {
	cfg := &config.Config{
		DataDir: t.TempDir(),
		Garage:  config.GarageConfig{AdminToken: "bootstrap-token"},
		Auth:    config.AuthConfig{Admin: config.AdminAuthConfig{Enabled: true}},
	}
	svc := newAuthTestService(t, cfg.Auth.Admin)
	h := NewAuthHandler(cfg, svc)
	app := fiber.New()
	app.Post("/auth/login-token", h.LoginToken)
	app.Post("/auth/setup-admin", func(c fiber.Ctx) error {
		user, err := svc.ValidateSessionToken(c.Get("Authorization")[7:])
		if err != nil {
			return err
		}
		c.Locals("userInfo", user)
		return h.SetupAdmin(c)
	})
	app.Post("/auth/login", h.LoginAdmin)
	app.Get("/protected",
		func(c fiber.Ctx) error {
			user, err := svc.ValidateSessionToken(c.Get("Authorization")[7:])
			if err != nil {
				return err
			}
			c.Locals("userInfo", user)
			return c.Next()
		},
		h.RejectCompletedBootstrapSession,
		func(c fiber.Ctx) error { return c.SendStatus(http.StatusNoContent) },
	)

	loginReq := httptest.NewRequest(http.MethodPost, "/auth/login-token", strings.NewReader(`{"token":"bootstrap-token"}`))
	loginReq.Header.Set("Content-Type", "application/json")
	loginResp, err := app.Test(loginReq)
	if err != nil {
		t.Fatal(err)
	}
	defer loginResp.Body.Close()
	var login struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(loginResp.Body).Decode(&login); err != nil {
		t.Fatal(err)
	}

	setupReq := httptest.NewRequest(http.MethodPost, "/auth/setup-admin", strings.NewReader(`{"username":"garage-admin","password":"a-long-password"}`))
	setupReq.Header.Set("Content-Type", "application/json")
	setupReq.Header.Set("Authorization", "Bearer "+login.Token)
	setupResp, err := app.Test(setupReq)
	if err != nil {
		t.Fatal(err)
	}
	defer setupResp.Body.Close()
	if setupResp.StatusCode != http.StatusOK {
		t.Fatalf("setup status = %d", setupResp.StatusCode)
	}

	staleReq := httptest.NewRequest(http.MethodGet, "/protected", nil)
	staleReq.Header.Set("Authorization", "Bearer "+login.Token)
	staleResp, err := app.Test(staleReq)
	if err != nil {
		t.Fatal(err)
	}
	defer staleResp.Body.Close()
	if staleResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("stale bootstrap session status = %d, want 401", staleResp.StatusCode)
	}

	basicReq := httptest.NewRequest(http.MethodPost, "/auth/login", strings.NewReader(`{"username":"garage-admin","password":"a-long-password"}`))
	basicReq.Header.Set("Content-Type", "application/json")
	basicResp, err := app.Test(basicReq)
	if err != nil {
		t.Fatal(err)
	}
	defer basicResp.Body.Close()
	if basicResp.StatusCode != http.StatusOK {
		t.Fatalf("basic status = %d", basicResp.StatusCode)
	}

	secondTokenReq := httptest.NewRequest(http.MethodPost, "/auth/login-token", strings.NewReader(`{"token":"bootstrap-token"}`))
	secondTokenReq.Header.Set("Content-Type", "application/json")
	secondTokenResp, err := app.Test(secondTokenReq)
	if err != nil {
		t.Fatal(err)
	}
	defer secondTokenResp.Body.Close()
	if secondTokenResp.StatusCode != http.StatusForbidden {
		t.Fatalf("second token login status = %d, want 403", secondTokenResp.StatusCode)
	}
}

func TestExplicitTokenSessionRemainsValidAfterAdminSetup(t *testing.T) {
	cfg := &config.Config{
		DataDir: t.TempDir(),
		Garage:  config.GarageConfig{AdminToken: "long-term-token"},
		Auth: config.AuthConfig{
			Admin: config.AdminAuthConfig{Enabled: true},
			Token: config.TokenAuthConfig{Enabled: true},
		},
	}
	svc := newAuthTestService(t, cfg.Auth.Admin)
	h := NewAuthHandler(cfg, svc)
	if err := h.adminStore.Create("garage-admin", "a-long-password"); err != nil {
		t.Fatal(err)
	}
	app := fiber.New()
	app.Post("/auth/login-token", h.LoginToken)

	req := httptest.NewRequest(http.MethodPost, "/auth/login-token", strings.NewReader(`{"token":"long-term-token"}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	user, err := svc.ValidateSessionToken(body.Token)
	if err != nil {
		t.Fatal(err)
	}
	if user.AuthMethod != "token" {
		t.Fatalf("auth method = %q, want token", user.AuthMethod)
	}
}

func TestGetAuthConfig_TokenEnabled(t *testing.T) {
	cfg := &config.Config{
		Auth: config.AuthConfig{
			Token: config.TokenAuthConfig{Enabled: true},
		},
	}
	app, _ := newAuthTestApp(t, cfg)
	req := httptest.NewRequest(http.MethodGet, "/auth/config", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	var body struct {
		Token struct {
			Enabled bool `json:"enabled"`
		} `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if !body.Token.Enabled {
		t.Error("token.enabled = false, want true")
	}
}

func TestGetMe_OIDCUserInfoLocal(t *testing.T) {
	cfg := &config.Config{Auth: config.AuthConfig{}}
	app, h := newAuthTestApp(t, cfg)
	// Re-register /auth/me with a pre-handler that seeds c.Locals("userInfo").
	// The default registration in newAuthTestApp lacks Locals; we mount a
	// second path that does.
	app.Get("/me-oidc", func(c fiber.Ctx) error {
		c.Locals("userInfo", &auth.UserInfo{
			Username: "alice",
			Email:    "alice@example.com",
			Name:     "Alice Example",
		})
		return h.GetMe(c)
	})

	req := httptest.NewRequest(http.MethodGet, "/me-oidc", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var decoded struct {
		Success bool `json:"success"`
		User    struct {
			Username string `json:"username"`
			Email    string `json:"email"`
			Name     string `json:"name"`
		} `json:"user"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&decoded); err != nil {
		t.Fatalf("decode: %v", err)
	}
	if decoded.User.Username != "alice" || decoded.User.Email != "alice@example.com" || decoded.User.Name != "Alice Example" {
		t.Errorf("got %+v", decoded.User)
	}
}

func TestGetMe_BasicAuthUsernameLocal(t *testing.T) {
	cfg := &config.Config{Auth: config.AuthConfig{}}
	app, h := newAuthTestApp(t, cfg)
	app.Get("/me-basic", func(c fiber.Ctx) error {
		c.Locals("username", "admin")
		return h.GetMe(c)
	})
	req := httptest.NewRequest(http.MethodGet, "/me-basic", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var decoded struct {
		User struct {
			Username string `json:"username"`
		} `json:"user"`
	}
	_ = json.NewDecoder(resp.Body).Decode(&decoded)
	if decoded.User.Username != "admin" {
		t.Errorf("username = %q, want admin", decoded.User.Username)
	}
}

func TestGetMe_NoLocalsReturns401(t *testing.T) {
	cfg := &config.Config{Auth: config.AuthConfig{}}
	app, _ := newAuthTestApp(t, cfg)
	req := httptest.NewRequest(http.MethodGet, "/auth/me", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}
