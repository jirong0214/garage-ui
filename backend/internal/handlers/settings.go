package handlers

import (
	"errors"

	"Noooste/garage-ui/internal/models"
	appsettings "Noooste/garage-ui/internal/settings"

	"github.com/gofiber/fiber/v3"
)

type SettingsHandler struct {
	publicURLs *appsettings.PublicURLService
}

type UpdateBucketPublicURLRequest struct {
	Mode string `json:"mode"`
	URL  string `json:"url,omitempty"`
}

func NewSettingsHandler(publicURLs *appsettings.PublicURLService) *SettingsHandler {
	return &SettingsHandler{publicURLs: publicURLs}
}

// GetPublicURLs returns the global public URL template and bucket overrides.
//
//	@Summary		Get public URL settings
//	@Tags			Settings
//	@Produce		json
//	@Success		200	{object}	models.APIResponse
//	@Router			/api/v1/settings/public-urls [get]
func (h *SettingsHandler) GetPublicURLs(c fiber.Ctx) error {
	return c.JSON(models.SuccessResponse(h.publicURLs.Get()))
}

// UpdatePublicURLs replaces the global public URL settings.
//
//	@Summary		Update public URL settings
//	@Tags			Settings
//	@Accept			json
//	@Produce		json
//	@Param			request	body		settings.PublicURLConfig	true	"Public URL settings"
//	@Success		200		{object}	models.APIResponse
//	@Router			/api/v1/settings/public-urls [put]
func (h *SettingsHandler) UpdatePublicURLs(c fiber.Ctx) error {
	var req appsettings.PublicURLConfig
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body: "+err.Error()),
		)
	}

	updated, err := h.publicURLs.Update(req)
	if err != nil {
		return publicURLSettingsError(c, err)
	}
	return c.JSON(models.SuccessResponse(updated))
}

// GetBucketPublicURL returns a bucket's effective URL configuration.
//
//	@Summary		Get bucket public URL
//	@Tags			Buckets
//	@Produce		json
//	@Param			name	path		string	true	"Bucket name"
//	@Success		200		{object}	models.APIResponse
//	@Router			/api/v1/buckets/{name}/public-url [get]
func (h *SettingsHandler) GetBucketPublicURL(c fiber.Ctx) error {
	bucket := c.Params("name")
	if bucket == "" {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Bucket name is required"),
		)
	}
	return c.JSON(models.SuccessResponse(h.publicURLs.GetBucket(bucket)))
}

// UpdateBucketPublicURL changes a bucket's inherited or custom URL mode.
//
//	@Summary		Update bucket public URL
//	@Tags			Buckets
//	@Accept			json
//	@Produce		json
//	@Param			name	path		string						true	"Bucket name"
//	@Param			request	body		UpdateBucketPublicURLRequest	true	"Bucket public URL"
//	@Success		200		{object}	models.APIResponse
//	@Router			/api/v1/buckets/{name}/public-url [put]
func (h *SettingsHandler) UpdateBucketPublicURL(c fiber.Ctx) error {
	bucket := c.Params("name")
	var req UpdateBucketPublicURLRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body: "+err.Error()),
		)
	}

	updated, err := h.publicURLs.SetBucket(bucket, req.Mode, req.URL)
	if err != nil {
		return publicURLSettingsError(c, err)
	}
	return c.JSON(models.SuccessResponse(updated))
}

func publicURLSettingsError(c fiber.Ctx, err error) error {
	if errors.Is(err, appsettings.ErrInvalid) {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, err.Error()),
		)
	}
	return c.Status(fiber.StatusInternalServerError).JSON(
		models.ErrorResponse(models.ErrCodeInternalError, "Failed to save public URL settings: "+err.Error()),
	)
}
