package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"Noooste/garage-ui/internal/auth"
	"Noooste/garage-ui/internal/models"
	"Noooste/garage-ui/internal/services"

	"github.com/gofiber/fiber/v3"
)

type objectJobServiceStub struct {
	created *models.ObjectJob
	job     *models.ObjectJob
}

func (s *objectJobServiceStub) Create(_ context.Context, owner string, req models.CreateObjectJobRequest, _ string) (*models.ObjectJob, error) {
	s.created = &models.ObjectJob{ID: "job-1", Owner: owner, Operation: req.Operation, Status: models.ObjectJobStatusQueued}
	return s.created, nil
}
func (s *objectJobServiceStub) Get(string) (*models.ObjectJob, error) {
	if s.job == nil {
		return nil, services.ErrObjectJobNotFound
	}
	return s.job, nil
}
func (s *objectJobServiceStub) List(string, bool, int) ([]models.ObjectJob, error) {
	return nil, nil
}
func (s *objectJobServiceStub) Failures(string, int, int) (*models.ObjectJobFailureList, error) {
	return &models.ObjectJobFailureList{}, nil
}
func (s *objectJobServiceStub) Cancel(string) (*models.ObjectJob, error) { return s.job, nil }
func (s *objectJobServiceStub) Close() error                             { return nil }

func TestObjectJobHandlerCreateReturnsAccepted(t *testing.T) {
	service := &objectJobServiceStub{}
	handler := NewObjectJobHandler(service)
	app := fiber.New()
	app.Post("/jobs", func(c fiber.Ctx) error {
		c.Locals("userInfo", &auth.UserInfo{Username: "alice"})
		return c.Next()
	}, handler.Create)
	req := httptest.NewRequest(http.MethodPost, "/jobs", strings.NewReader(`{
		"operation":"copy","sourceBucket":"pics","objects":["a.jpg"],"destinationBucket":"backup"
	}`))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusAccepted {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if service.created == nil || service.created.Owner != "alice" {
		t.Fatalf("created = %+v", service.created)
	}
}

func TestObjectJobHandlerHidesAnotherUsersJob(t *testing.T) {
	service := &objectJobServiceStub{job: &models.ObjectJob{ID: "job-1", Owner: "bob"}}
	handler := NewObjectJobHandler(service)
	app := fiber.New()
	app.Get("/jobs/:id", func(c fiber.Ctx) error {
		c.Locals("userInfo", &auth.UserInfo{Username: "alice"})
		return c.Next()
	}, handler.Get)
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/jobs/job-1", nil))
	if err != nil {
		t.Fatal(err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var body models.APIResponse
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		t.Fatal(err)
	}
	if body.Error == nil || body.Error.Code != models.ErrCodeNotFound {
		t.Fatalf("body = %+v", body)
	}
}
