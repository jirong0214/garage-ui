package handlers

import (
	"crypto/subtle"
	"errors"
	"strings"

	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"

	"github.com/gofiber/fiber/v3"
)

// AuthHandler handles authentication-related requests
type AuthHandler struct {
	cfg         *config.Config
	authService *auth.Service
	adminStore  *auth.LocalAdminStore
}

// NewAuthHandler creates a new auth handler
func NewAuthHandler(cfg *config.Config, authService *auth.Service) *AuthHandler {
	return &AuthHandler{
		cfg:         cfg,
		authService: authService,
		adminStore:  auth.NewLocalAdminStore(cfg.DataDir),
	}
}

// GetAuthConfig returns the current authentication configuration
//
//	@Summary		Get authentication configuration
//	@Description	Returns the current auth configuration (admin and/or OIDC)
//	@Tags			auth
//	@Produce		json
//	@Success		200	{object}	models.AuthConfigResponse	"Auth config"
//	@Failure		500	{object}	models.APIResponse			"Configuration unavailable"
//	@ID				getAuthConfig
//	@Router			/auth/config [get]
func (h *AuthHandler) GetAuthConfig(c fiber.Ctx) error {
	configured, err := h.adminStore.Configured()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to read administrator configuration"))
	}
	bootstrapRequired := h.cfg.Auth.Admin.Enabled && !configured && h.cfg.Auth.Admin.Username == "" && h.cfg.Auth.Admin.Password == ""
	response := models.AuthConfigResponse{
		Admin: models.AdminAuthMethodConfig{
			Enabled:           h.cfg.Auth.Admin.Enabled,
			BootstrapRequired: bootstrapRequired,
		},
		OIDC: models.OIDCAuthMethodConfig{
			Enabled: h.cfg.Auth.OIDC.Enabled,
		},
		Token: models.AuthMethodConfig{
			Enabled: h.cfg.Auth.Token.Enabled || bootstrapRequired,
		},
	}

	// Add provider name if OIDC is enabled
	if h.cfg.Auth.OIDC.Enabled {
		provider := h.cfg.Auth.OIDC.ProviderName
		if provider == "" {
			provider = "OIDC Provider"
		}
		response.OIDC.Provider = provider
	}

	return c.JSON(response)
}

// LoginBasicRequest represents the basic auth login request
type LoginBasicRequest struct {
	Username       string `json:"username" validate:"required"`
	Password       string `json:"password" validate:"required"`
	DeviceName     string `json:"device_name,omitempty"`
	DevicePlatform string `json:"device_platform,omitempty"`
}

type RefreshSessionRequest struct {
	RefreshToken string `json:"refresh_token" validate:"required"`
}

// LoginAdmin handles admin authentication login
//
//	@Summary		Admin auth login
//	@Description	Authenticate with admin username and password, returns JWT token
//	@Tags			auth
//	@Accept			json
//	@Produce		json
//	@Param			credentials	body		LoginBasicRequest								true	"Login credentials"
//	@Success		200			{object}	models.LoginResponse								"Login successful"
//	@Failure		400			{object}	models.APIResponse								"Invalid request"
//	@Failure		401			{object}	models.APIResponse								"Invalid credentials"
//	@Failure		500			{object}	models.APIResponse								"Session creation failed"
//	@ID				login
//	@Router			/auth/login [post]
func (h *AuthHandler) LoginAdmin(c fiber.Ctx) error {
	// Parse request body
	var req LoginBasicRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body"),
		)
	}

	valid, err := h.verifyAdminCredentials(req.Username, req.Password)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to verify credentials"))
	}
	if !valid {
		return c.Status(fiber.StatusUnauthorized).JSON(
			models.ErrorResponse(models.ErrCodeUnauthorized, "Invalid credentials"),
		)
	}

	// Create user info object
	userInfo := &auth.UserInfo{
		Username:   req.Username,
		AuthMethod: "admin",
	}

	if req.DeviceName != "" || req.DevicePlatform != "" {
		if err := validateDeviceDescription(req.DeviceName, req.DevicePlatform); err != nil {
			return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse(models.ErrCodeBadRequest, err.Error()))
		}
		tokens, err := h.authService.CreateDeviceSession(userInfo, req.DeviceName, req.DevicePlatform)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to create device session"))
		}
		return c.JSON(deviceLoginResponse(tokens))
	}

	// Existing Web clients omit device_name and keep the historical stateless
	// access-only JWT response.
	sessionToken, err := h.authService.GenerateSessionToken(userInfo)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to create session"))
	}
	return c.JSON(models.LoginResponse{
		Success: true,
		Token:   sessionToken,
		User: models.SessionUser{
			Username:   userInfo.Username,
			AuthMethod: userInfo.AuthMethod,
		},
	})
}

func (h *AuthHandler) verifyAdminCredentials(username, password string) (bool, error) {
	configured, err := h.adminStore.Configured()
	if err != nil {
		return false, err
	}
	if configured {
		return h.adminStore.Verify(username, password)
	}
	// Transitional support for existing environment-backed deployments. A
	// successful login can later replace these credentials through the UI.
	if h.cfg.Auth.Admin.Username != "" && h.cfg.Auth.Admin.Password != "" {
		return subtle.ConstantTimeCompare([]byte(h.cfg.Auth.Admin.Username), []byte(username)) == 1 &&
			subtle.ConstantTimeCompare([]byte(h.cfg.Auth.Admin.Password), []byte(password)) == 1, nil
	}
	return false, nil
}

// LoginTokenRequest represents the token auth login request
type LoginTokenRequest struct {
	Token string `json:"token" validate:"required"`
}

// LoginToken handles admin token authentication login
func (h *AuthHandler) LoginToken(c fiber.Ctx) error {
	var req LoginTokenRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body"),
		)
	}

	configured, err := h.adminStore.Configured()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to read administrator configuration"))
	}
	if configured && !h.cfg.Auth.Token.Enabled {
		return c.Status(fiber.StatusForbidden).JSON(models.ErrorResponse(models.ErrCodeForbidden, "Admin token login is only available during initial setup"))
	}

	// Constant-time comparison to prevent timing attacks
	if subtle.ConstantTimeCompare([]byte(h.cfg.Garage.AdminToken), []byte(req.Token)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(
			models.ErrorResponse(models.ErrCodeUnauthorized, "Invalid admin token"),
		)
	}

	authMethod := "token"
	if h.cfg.Auth.Admin.Enabled && !configured {
		authMethod = "bootstrap-token"
	}
	userInfo := &auth.UserInfo{
		Username:   "admin-token",
		AuthMethod: authMethod,
	}

	sessionToken, err := h.authService.GenerateSessionToken(userInfo)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(
			models.ErrorResponse(models.ErrCodeInternalError, "Failed to create session"),
		)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"token":   sessionToken,
		"user": fiber.Map{
			"username":    userInfo.Username,
			"auth_method": userInfo.AuthMethod,
		},
	})
}

// SetupAdmin creates the first local Garage UI administrator. It only accepts
// a session created from the Garage admin token while no local account exists.
func (h *AuthHandler) SetupAdmin(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok || user.AuthMethod != "bootstrap-token" {
		return c.Status(fiber.StatusForbidden).JSON(models.ErrorResponse(models.ErrCodeForbidden, "Initial setup requires an admin token session"))
	}
	var req LoginBasicRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body"))
	}
	if err := h.adminStore.Create(req.Username, req.Password); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse(models.ErrCodeBadRequest, err.Error()))
	}
	return h.respondWithSession(c, &auth.UserInfo{Username: req.Username, AuthMethod: "admin"})
}

// UpdateAdminCredentials changes the local administrator after verifying its
// current password. This endpoint deliberately never accepts the Garage token.
func (h *AuthHandler) UpdateAdminCredentials(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok || user.AuthMethod != "admin" {
		return c.Status(fiber.StatusForbidden).JSON(models.ErrorResponse(models.ErrCodeForbidden, "Sign in with the local administrator account to change credentials"))
	}
	var req struct {
		Username        string `json:"username" validate:"required"`
		CurrentPassword string `json:"current_password" validate:"required"`
		NewPassword     string `json:"new_password" validate:"required"`
	}
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body"))
	}
	valid, err := h.verifyAdminCredentials(user.Username, req.CurrentPassword)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to verify credentials"))
	}
	if !valid {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Current password is incorrect"))
	}
	if err := h.adminStore.Update(req.Username, req.NewPassword); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse(models.ErrCodeBadRequest, err.Error()))
	}
	if _, err := h.authService.RevokeAllDeviceSessions(user); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Credentials changed, but existing device sessions could not be revoked"))
	}
	return h.respondWithSession(c, &auth.UserInfo{Username: req.Username, AuthMethod: "admin"})
}

// RefreshSession rotates an opaque refresh token and returns a new token pair.
//
//	@Summary		Refresh a device session
//	@Description	Atomically rotates a device refresh token. Reusing any previously rotated token revokes the device session.
//	@Tags			auth
//	@Accept			json
//	@Produce		json
//	@Param			request	body		RefreshSessionRequest	true	"Refresh token"
//	@Success		200		{object}	models.LoginResponse
//	@Failure		400		{object}	models.APIResponse
//	@Failure		401		{object}	models.APIResponse
//	@Failure		500		{object}	models.APIResponse
//	@ID				refreshSession
//	@Router			/auth/refresh [post]
func (h *AuthHandler) RefreshSession(c fiber.Ctx) error {
	var req RefreshSessionRequest
	if err := c.Bind().JSON(&req); err != nil || strings.TrimSpace(req.RefreshToken) == "" {
		return c.Status(fiber.StatusBadRequest).JSON(models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body"))
	}
	tokens, err := h.authService.RefreshDeviceSession(req.RefreshToken)
	if err != nil {
		if errors.Is(err, auth.ErrInvalidRefreshToken) ||
			errors.Is(err, auth.ErrRefreshTokenReused) ||
			errors.Is(err, auth.ErrDeviceSessionExpired) ||
			errors.Is(err, auth.ErrDeviceSessionRevoked) {
			return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Refresh token is invalid or expired"))
		}
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to refresh device session"))
	}
	return c.JSON(deviceLoginResponse(tokens))
}

// ListDeviceSessions returns every session for the authenticated identity.
//
//	@Summary		List device sessions
//	@Tags			auth
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	models.DeviceSessionListResponse
//	@Failure		401	{object}	models.APIResponse
//	@Failure		500	{object}	models.APIResponse
//	@ID				listDeviceSessions
//	@Router			/auth/sessions [get]
func (h *AuthHandler) ListDeviceSessions(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Not authenticated"))
	}
	sessions, err := h.authService.ListDeviceSessions(user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to list device sessions"))
	}
	response := models.DeviceSessionListResponse{Sessions: make([]models.DeviceSessionResponse, 0, len(sessions))}
	for _, session := range sessions {
		response.Sessions = append(response.Sessions, deviceSessionResponse(session))
	}
	return c.JSON(response)
}

// RevokeDeviceSession revokes one session belonging to the caller.
//
//	@Summary		Revoke a device session
//	@Tags			auth
//	@Produce		json
//	@Security		BearerAuth
//	@Param			id	path		string	true	"Device session ID"
//	@Success		200	{object}	models.SessionRevocationResponse
//	@Failure		401	{object}	models.APIResponse
//	@Failure		403	{object}	models.APIResponse
//	@Failure		404	{object}	models.APIResponse
//	@Failure		500	{object}	models.APIResponse
//	@ID				revokeDeviceSession
//	@Router			/auth/sessions/{id} [delete]
func (h *AuthHandler) RevokeDeviceSession(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Not authenticated"))
	}
	err := h.authService.RevokeDeviceSession(user, c.Params("id"))
	if errors.Is(err, auth.ErrDeviceSessionNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(models.ErrorResponse(models.ErrCodeNotFound, "Device session not found"))
	}
	if errors.Is(err, auth.ErrDeviceSessionForbidden) {
		return c.Status(fiber.StatusForbidden).JSON(models.ErrorResponse(models.ErrCodeForbidden, "Device session belongs to another user"))
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to revoke device session"))
	}
	return c.JSON(models.SessionRevocationResponse{Success: true, Revoked: 1})
}

// RevokeAllDeviceSessions revokes every device session for the caller.
//
//	@Summary		Revoke all device sessions
//	@Tags			auth
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	models.SessionRevocationResponse
//	@Failure		401	{object}	models.APIResponse
//	@Failure		500	{object}	models.APIResponse
//	@ID				revokeAllDeviceSessions
//	@Router			/auth/sessions [delete]
func (h *AuthHandler) RevokeAllDeviceSessions(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Not authenticated"))
	}
	count, err := h.authService.RevokeAllDeviceSessions(user)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to revoke device sessions"))
	}
	return c.JSON(models.SessionRevocationResponse{Success: true, Revoked: count})
}

// Logout revokes the current device session. Access-only Web JWTs remain
// stateless and receive the same successful response.
//
//	@Summary		Log out current device session
//	@Tags			auth
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	models.SessionRevocationResponse
//	@Failure		401	{object}	models.APIResponse
//	@Failure		500	{object}	models.APIResponse
//	@ID				logoutSession
//	@Router			/auth/logout [post]
func (h *AuthHandler) Logout(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Not authenticated"))
	}
	revoked := 0
	if user.SessionID != "" {
		if err := h.authService.RevokeCurrentDeviceSession(user); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to revoke device session"))
		}
		revoked = 1
	}
	return c.JSON(models.SessionRevocationResponse{Success: true, Revoked: revoked})
}

func validateDeviceDescription(name, platform string) error {
	name = strings.TrimSpace(name)
	platform = strings.TrimSpace(platform)
	if name == "" {
		return errors.New("device_name is required when requesting a device session")
	}
	if len([]rune(name)) > 128 {
		return errors.New("device_name must not exceed 128 characters")
	}
	if len([]rune(platform)) > 64 {
		return errors.New("device_platform must not exceed 64 characters")
	}
	return nil
}

func deviceLoginResponse(tokens *auth.DeviceSessionTokens) models.LoginResponse {
	accessExpiresAt := tokens.AccessTokenExpiresAt
	refreshExpiresAt := tokens.RefreshTokenExpiresAt
	return models.LoginResponse{
		Success:               true,
		Token:                 tokens.AccessToken,
		RefreshToken:          tokens.RefreshToken,
		AccessTokenExpiresAt:  &accessExpiresAt,
		RefreshTokenExpiresAt: &refreshExpiresAt,
		Session:               ptr(deviceSessionResponse(tokens.Session)),
		User: models.SessionUser{
			Username:   tokens.User.Username,
			Email:      tokens.User.Email,
			Name:       tokens.User.Name,
			AuthMethod: tokens.User.AuthMethod,
		},
	}
}

func deviceSessionResponse(session auth.DeviceSessionInfo) models.DeviceSessionResponse {
	return models.DeviceSessionResponse{
		ID:             session.ID,
		DeviceName:     session.DeviceName,
		DevicePlatform: session.DevicePlatform,
		CreatedAt:      session.CreatedAt,
		LastUsedAt:     session.LastUsedAt,
		ExpiresAt:      session.ExpiresAt,
		RevokedAt:      session.RevokedAt,
		Current:        session.Current,
	}
}

func ptr[T any](value T) *T {
	return &value
}

func (h *AuthHandler) respondWithSession(c fiber.Ctx, userInfo *auth.UserInfo) error {
	sessionToken, err := h.authService.GenerateSessionToken(userInfo)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to create session"))
	}
	return c.JSON(fiber.Map{"success": true, "token": sessionToken, "user": fiber.Map{"username": userInfo.Username, "auth_method": userInfo.AuthMethod}})
}

// RejectCompletedBootstrapSession revokes all one-time bootstrap JWTs as soon
// as a local administrator exists. Explicit long-term token sessions use the
// distinct "token" auth method and are intentionally unaffected.
func (h *AuthHandler) RejectCompletedBootstrapSession(c fiber.Ctx) error {
	user, ok := c.Locals("userInfo").(*auth.UserInfo)
	if !ok || user.AuthMethod != "bootstrap-token" {
		return c.Next()
	}
	configured, err := h.adminStore.Configured()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to read administrator configuration"))
	}
	if configured {
		return c.Status(fiber.StatusUnauthorized).JSON(models.ErrorResponse(models.ErrCodeUnauthorized, "Initial setup session has expired"))
	}
	return c.Next()
}

// GetMe returns the current authenticated user's information
//
//	@Summary		Get current user
//	@Description	Returns information about the currently authenticated user
//	@Tags			auth
//	@Produce		json
//	@Security		BearerAuth
//	@Success		200	{object}	models.CurrentUserResponse	"User information"
//	@Failure		401	{object}	models.APIResponse					"Not authenticated"
//	@ID				getCurrentUser
//	@Router			/auth/me [get]
func (h *AuthHandler) GetMe(c fiber.Ctx) error {
	// Try to get user info from OIDC context
	userInfoInterface := c.Locals("userInfo")
	if userInfoInterface != nil {
		userInfo, ok := userInfoInterface.(*auth.UserInfo)
		if ok {
			return c.JSON(models.CurrentUserResponse{
				Success: true,
				User: models.SessionUser{
					Username:   userInfo.Username,
					Email:      userInfo.Email,
					Name:       userInfo.Name,
					AuthMethod: userInfo.AuthMethod,
				},
			})
		}
	}

	// Try to get username from basic auth context
	usernameInterface := c.Locals("username")
	if usernameInterface != nil {
		username, ok := usernameInterface.(string)
		if ok {
			return c.JSON(models.CurrentUserResponse{
				Success: true,
				User: models.SessionUser{
					Username: username,
				},
			})
		}
	}

	return c.Status(fiber.StatusUnauthorized).JSON(
		models.ErrorResponse(models.ErrCodeUnauthorized, "Not authenticated"),
	)
}
