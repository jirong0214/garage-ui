package handlers

import (
	"errors"
	"strconv"
	"strings"

	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/authz"
	"Noooste/garage-ui/internal/models"
	"Noooste/garage-ui/internal/services"

	"github.com/gofiber/fiber/v3"
)

type ObjectJobHandler struct {
	jobs services.ObjectJobService
}

func NewObjectJobHandler(jobs services.ObjectJobService) *ObjectJobHandler {
	return &ObjectJobHandler{jobs: jobs}
}

// Create creates an asynchronous recursive or multi-object operation.
//
//	@Summary		Create an object job
//	@Description	Creates a durable copy, move, or delete job for explicit objects and recursive prefixes.
//	@Tags			Object Jobs
//	@Accept			json
//	@Produce		json
//	@Param			Idempotency-Key	header		string							false	"Retry-safe request key"
//	@Param			request			body		models.CreateObjectJobRequest	true	"Job specification"
//	@Success		202				{object}	models.APIResponse{data=models.ObjectJob}
//	@Failure		400				{object}	models.APIResponse{error=models.APIError}
//	@Failure		403				{object}	models.APIResponse{error=models.APIError}
//	@Failure		500				{object}	models.APIResponse{error=models.APIError}
//	@Router			/api/v1/object-jobs [post]
func (h *ObjectJobHandler) Create(c fiber.Ctx) error {
	var req models.CreateObjectJobRequest
	if err := c.Bind().JSON(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Invalid request body"),
		)
	}
	idempotencyKey := strings.TrimSpace(c.Get("Idempotency-Key"))
	if len(idempotencyKey) > 200 {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, "Idempotency-Key must not exceed 200 characters"),
		)
	}
	job, err := h.jobs.Create(c.Context(), requestOwner(c), req, idempotencyKey)
	if err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(
			models.ErrorResponse(models.ErrCodeBadRequest, err.Error()),
		)
	}
	return c.Status(fiber.StatusAccepted).JSON(models.SuccessResponse(job))
}

// List returns the current user's recent object jobs.
//
//	@Summary		List object jobs
//	@Tags			Object Jobs
//	@Produce		json
//	@Param			limit	query		int	false	"Maximum jobs, 1-100"
//	@Success		200		{object}	models.APIResponse{data=models.ObjectJobList}
//	@Router			/api/v1/object-jobs [get]
func (h *ObjectJobHandler) List(c fiber.Ctx) error {
	limit, _ := strconv.Atoi(c.Query("limit", "20"))
	jobs, err := h.jobs.List(requestOwner(c), requestIsAdmin(c), limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(
			models.ErrorResponse(models.ErrCodeInternalError, err.Error()),
		)
	}
	return c.JSON(models.SuccessResponse(models.ObjectJobList{Jobs: jobs, Count: len(jobs)}))
}

// Get returns current progress and aggregate counts for one job.
//
//	@Summary		Get object job
//	@Tags			Object Jobs
//	@Produce		json
//	@Param			id	path		string	true	"Job ID"
//	@Success		200	{object}	models.APIResponse{data=models.ObjectJob}
//	@Failure		404	{object}	models.APIResponse{error=models.APIError}
//	@Router			/api/v1/object-jobs/{id} [get]
func (h *ObjectJobHandler) Get(c fiber.Ctx) error {
	job, err := h.jobs.Get(c.Params("id"))
	if err != nil {
		return objectJobError(c, err)
	}
	if !canAccessObjectJob(c, job) {
		return c.Status(fiber.StatusNotFound).JSON(
			models.ErrorResponse(models.ErrCodeNotFound, "Object job not found"),
		)
	}
	return c.JSON(models.SuccessResponse(job))
}

// Failures returns paginated per-object failures for one job.
//
//	@Summary		List object job failures
//	@Tags			Object Jobs
//	@Produce		json
//	@Param			id		path		string	true	"Job ID"
//	@Param			offset	query		int		false	"Zero-based offset"
//	@Param			limit	query		int		false	"Page size, 1-200"
//	@Success		200		{object}	models.APIResponse{data=models.ObjectJobFailureList}
//	@Router			/api/v1/object-jobs/{id}/failures [get]
func (h *ObjectJobHandler) Failures(c fiber.Ctx) error {
	job, err := h.jobs.Get(c.Params("id"))
	if err != nil {
		return objectJobError(c, err)
	}
	if !canAccessObjectJob(c, job) {
		return c.Status(fiber.StatusNotFound).JSON(
			models.ErrorResponse(models.ErrCodeNotFound, "Object job not found"),
		)
	}
	offset, _ := strconv.Atoi(c.Query("offset", "0"))
	limit, _ := strconv.Atoi(c.Query("limit", "50"))
	if offset < 0 {
		offset = 0
	}
	result, err := h.jobs.Failures(job.ID, offset, limit)
	if err != nil {
		return objectJobError(c, err)
	}
	return c.JSON(models.SuccessResponse(result))
}

// Cancel requests cooperative cancellation of an object job.
//
//	@Summary		Cancel object job
//	@Tags			Object Jobs
//	@Produce		json
//	@Param			id	path		string	true	"Job ID"
//	@Success		200	{object}	models.APIResponse{data=models.ObjectJob}
//	@Router			/api/v1/object-jobs/{id}/cancel [post]
func (h *ObjectJobHandler) Cancel(c fiber.Ctx) error {
	job, err := h.jobs.Get(c.Params("id"))
	if err != nil {
		return objectJobError(c, err)
	}
	if !canAccessObjectJob(c, job) {
		return c.Status(fiber.StatusNotFound).JSON(
			models.ErrorResponse(models.ErrCodeNotFound, "Object job not found"),
		)
	}
	job, err = h.jobs.Cancel(job.ID)
	if err != nil {
		return objectJobError(c, err)
	}
	return c.JSON(models.SuccessResponse(job))
}

func requestOwner(c fiber.Ctx) string {
	if subject, ok := authz.SubjectFrom(c); ok && subject.ID != "" {
		return subject.ID
	}
	if user, ok := c.Locals("userInfo").(*auth.UserInfo); ok && user != nil {
		if user.Username != "" {
			return user.Username
		}
		if user.Email != "" {
			return user.Email
		}
	}
	return "anonymous"
}

func requestIsAdmin(c fiber.Ctx) bool {
	subject, ok := authz.SubjectFrom(c)
	return ok && subject.IsAdmin
}

func canAccessObjectJob(c fiber.Ctx, job *models.ObjectJob) bool {
	return requestIsAdmin(c) || job.Owner == requestOwner(c)
}

func objectJobError(c fiber.Ctx, err error) error {
	if errors.Is(err, services.ErrObjectJobNotFound) {
		return c.Status(fiber.StatusNotFound).JSON(
			models.ErrorResponse(models.ErrCodeNotFound, "Object job not found"),
		)
	}
	return c.Status(fiber.StatusInternalServerError).JSON(
		models.ErrorResponse(models.ErrCodeInternalError, err.Error()),
	)
}
