package handlers

import (
	"crypto/subtle"

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
//	@Success		200	{object}	object{admin=object,oidc=object}	"Auth config"
//	@Router			/auth/config [get]
func (h *AuthHandler) GetAuthConfig(c fiber.Ctx) error {
	configured, err := h.adminStore.Configured()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(models.ErrorResponse(models.ErrCodeInternalError, "Failed to read administrator configuration"))
	}
	bootstrapRequired := h.cfg.Auth.Admin.Enabled && !configured && h.cfg.Auth.Admin.Username == "" && h.cfg.Auth.Admin.Password == ""
	response := fiber.Map{
		"admin": fiber.Map{
			"enabled":            h.cfg.Auth.Admin.Enabled,
			"bootstrap_required": bootstrapRequired,
		},
		"oidc": fiber.Map{
			"enabled": h.cfg.Auth.OIDC.Enabled,
		},
		"token": fiber.Map{
			"enabled": h.cfg.Auth.Token.Enabled || bootstrapRequired,
		},
	}

	// Add provider name if OIDC is enabled
	if h.cfg.Auth.OIDC.Enabled {
		provider := h.cfg.Auth.OIDC.ProviderName
		if provider == "" {
			provider = "OIDC Provider"
		}
		response["oidc"].(fiber.Map)["provider"] = provider
	}

	return c.JSON(response)
}

// LoginBasicRequest represents the basic auth login request
type LoginBasicRequest struct {
	Username string `json:"username" validate:"required"`
	Password string `json:"password" validate:"required"`
}

// LoginAdmin handles admin authentication login
//
//	@Summary		Admin auth login
//	@Description	Authenticate with admin username and password, returns JWT token
//	@Tags			auth
//	@Accept			json
//	@Produce		json
//	@Param			credentials	body		LoginBasicRequest								true	"Login credentials"
//	@Success		200			{object}	object{success=bool,token=string,user=object}	"Login successful"
//	@Failure		400			{object}	models.APIResponse								"Invalid request"
//	@Failure		401			{object}	models.APIResponse								"Invalid credentials"
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

	// Generate JWT session token
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
	return h.respondWithSession(c, &auth.UserInfo{Username: req.Username, AuthMethod: "admin"})
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
//	@Security		ApiKeyAuth
//	@Success		200	{object}	object{success=bool,user=object}	"User information"
//	@Failure		401	{object}	models.APIResponse					"Not authenticated"
//	@Router			/auth/me [get]
func (h *AuthHandler) GetMe(c fiber.Ctx) error {
	// Try to get user info from OIDC context
	userInfoInterface := c.Locals("userInfo")
	if userInfoInterface != nil {
		userInfo, ok := userInfoInterface.(*auth.UserInfo)
		if ok {
			return c.JSON(fiber.Map{
				"success": true,
				"user": fiber.Map{
					"username":    userInfo.Username,
					"email":       userInfo.Email,
					"name":        userInfo.Name,
					"auth_method": userInfo.AuthMethod,
				},
			})
		}
	}

	// Try to get username from basic auth context
	usernameInterface := c.Locals("username")
	if usernameInterface != nil {
		username, ok := usernameInterface.(string)
		if ok {
			return c.JSON(fiber.Map{
				"success": true,
				"user": fiber.Map{
					"username": username,
				},
			})
		}
	}

	return c.Status(fiber.StatusUnauthorized).JSON(
		models.ErrorResponse(models.ErrCodeUnauthorized, "Not authenticated"),
	)
}
