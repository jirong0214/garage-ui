package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"Noooste/garage-ui/internal/models"
	"Noooste/garage-ui/internal/services/mocks"

	"github.com/gofiber/fiber/v3"
)

func newBucketsTestApp(t *testing.T) (*fiber.App, *mocks.AdminMock) {
	t.Helper()
	admin := &mocks.AdminMock{}
	app, _ := newBucketsTestAppWithS3(t, admin)
	return app, admin
}

func newBucketsTestAppWithS3(t *testing.T, admin *mocks.AdminMock) (*fiber.App, *mocks.S3Mock) {
	t.Helper()
	s3 := &mocks.S3Mock{}
	h := NewBucketHandler(admin, s3, nil)
	app := fiber.New()
	app.Get("/buckets", h.ListBuckets)
	app.Post("/buckets", h.CreateBucket)
	app.Get("/buckets/:name", h.GetBucketInfo)
	app.Delete("/buckets/:name", h.DeleteBucket)
	app.Post("/buckets/:name/permissions", h.GrantBucketPermission)
	app.Put("/buckets/:name/website", h.UpdateBucketWebsite)
	app.Put("/buckets/:name/quotas", h.UpdateBucketQuotas)
	return app, s3
}

func decodeJSON(t *testing.T, r io.Reader, v any) {
	t.Helper()
	if err := json.NewDecoder(r).Decode(v); err != nil {
		t.Fatalf("decode: %v", err)
	}
}

// --- ListBuckets ---

func TestListBuckets_MapsAliasesAndStats(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.ListBucketsFn = func(_ context.Context) ([]models.ListBucketsResponseItem, error) {
		return []models.ListBucketsResponseItem{
			{ID: "id-1", Created: time.Unix(0, 0), GlobalAliases: []string{"alpha"}},
			{ID: "id-2", Created: time.Unix(0, 0), GlobalAliases: []string{}}, // skipped: no global alias
			{ID: "id-3", Created: time.Unix(0, 0), GlobalAliases: []string{"gamma"}},
		}, nil
	}
	admin.GetBucketInfoByAliasFn = func(_ context.Context, alias string) (*models.GarageBucketInfo, error) {
		switch alias {
		case "alpha":
			return &models.GarageBucketInfo{ID: "id-1", Objects: 10, Bytes: 100, WebsiteAccess: true}, nil
		case "gamma":
			return nil, errors.New("detail fetch failed") // degraded path
		}
		return nil, errors.New("unexpected alias: " + alias)
	}
	req := httptest.NewRequest(http.MethodGet, "/buckets", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	var body struct {
		Data models.BucketListResponse `json:"data"`
	}
	decodeJSON(t, resp.Body, &body)
	if body.Data.Count != 2 {
		t.Errorf("count = %d, want 2 (id-2 skipped)", body.Data.Count)
	}
	// alpha has stats; gamma degraded to no stats (ObjectCount/Size nil).
	var foundAlpha, foundGamma bool
	for _, b := range body.Data.Buckets {
		if b.Name == "alpha" {
			foundAlpha = true
			if b.ObjectCount == nil || *b.ObjectCount != 10 {
				t.Errorf("alpha.ObjectCount = %v, want 10", b.ObjectCount)
			}
			if !b.WebsiteAccess {
				t.Error("alpha.WebsiteAccess false")
			}
		}
		if b.Name == "gamma" {
			foundGamma = true
			if b.ObjectCount != nil {
				t.Errorf("gamma.ObjectCount = %v, want nil (degraded)", *b.ObjectCount)
			}
		}
	}
	if !foundAlpha || !foundGamma {
		t.Errorf("missing buckets: alpha=%v gamma=%v", foundAlpha, foundGamma)
	}
}

func TestListBuckets_ExposesConfiguredPublicURLOnlyForWebsiteBuckets(t *testing.T) {
	admin := &mocks.AdminMock{}
	h := NewBucketHandler(admin, nil, map[string]string{
		"public":  "https://cdn.example.com",
		"private": "https://private.example.com",
	})
	app := fiber.New()
	app.Get("/buckets", h.ListBuckets)
	admin.ListBucketsFn = func(context.Context) ([]models.ListBucketsResponseItem, error) {
		return []models.ListBucketsResponseItem{
			{ID: "1", GlobalAliases: []string{"public"}},
			{ID: "2", GlobalAliases: []string{"private"}},
		}, nil
	}
	admin.GetBucketInfoByAliasFn = func(_ context.Context, alias string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: alias, WebsiteAccess: alias == "public"}, nil
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/buckets", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	var body struct {
		Data models.BucketListResponse `json:"data"`
	}
	decodeJSON(t, resp.Body, &body)
	if body.Data.Buckets[0].PublicURL != "https://cdn.example.com" {
		t.Errorf("public URL = %q", body.Data.Buckets[0].PublicURL)
	}
	if body.Data.Buckets[1].PublicURL != "" {
		t.Errorf("private bucket leaked public URL = %q", body.Data.Buckets[1].PublicURL)
	}
}

func TestListBuckets_DerivesPublicURLFromWebRootDomain(t *testing.T) {
	admin := &mocks.AdminMock{}
	h := NewBucketHandler(admin, nil, nil)
	h.SetPublicWebRouting("https", ".storage.example.com")
	app := fiber.New()
	app.Get("/buckets", h.ListBuckets)
	admin.ListBucketsFn = func(context.Context) ([]models.ListBucketsResponseItem, error) {
		return []models.ListBucketsResponseItem{{ID: "1", GlobalAliases: []string{"photos"}}}, nil
	}
	admin.GetBucketInfoByAliasFn = func(context.Context, string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "1", WebsiteAccess: true}, nil
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/buckets", nil))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	var body struct {
		Data models.BucketListResponse `json:"data"`
	}
	decodeJSON(t, resp.Body, &body)
	if got := body.Data.Buckets[0].PublicURL; got != "https://photos.storage.example.com" {
		t.Fatalf("PublicURL = %q", got)
	}
}

func TestListBuckets_AdminErrorReturns500(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.ListBucketsFn = func(_ context.Context) ([]models.ListBucketsResponseItem, error) {
		return nil, errors.New("boom")
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/buckets", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.StatusCode)
	}
}

// --- CreateBucket ---

func TestCreateBucket_Success201(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.CreateBucketFn = func(_ context.Context, r models.CreateBucketAdminRequest) (*models.GarageBucketInfo, error) {
		if r.GlobalAlias == nil || *r.GlobalAlias != "new-bucket" {
			t.Errorf("GlobalAlias = %v, want 'new-bucket'", r.GlobalAlias)
		}
		return &models.GarageBucketInfo{ID: "id-new"}, nil
	}
	body, _ := json.Marshal(map[string]string{"name": "new-bucket"})
	req := httptest.NewRequest(http.MethodPost, "/buckets", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("status = %d, want 201", resp.StatusCode)
	}
}

func TestCreateBucket_MissingNameReturns400(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	body, _ := json.Marshal(map[string]string{})
	req := httptest.NewRequest(http.MethodPost, "/buckets", bytes.NewReader(body))
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

func TestCreateBucket_MalformedJSONReturns400(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	req := httptest.NewRequest(http.MethodPost, "/buckets", strings.NewReader("{not-json"))
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

func TestCreateBucket_AdminErrorReturns500(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.CreateBucketFn = func(_ context.Context, _ models.CreateBucketAdminRequest) (*models.GarageBucketInfo, error) {
		return nil, errors.New("boom")
	}
	body, _ := json.Marshal(map[string]string{"name": "x"})
	req := httptest.NewRequest(http.MethodPost, "/buckets", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.StatusCode)
	}
}

// --- GetBucketInfo ---

func TestGetBucketInfo_Success(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, alias string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1", Bytes: 1, Objects: 1}, nil
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/buckets/alpha", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestGetBucketInfo_NotFound404(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return nil, nil // nil pointer, nil error → 404
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/buckets/missing", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestGetBucketInfo_ServiceErrorReturns500(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return nil, errors.New("boom")
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodGet, "/buckets/alpha", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.StatusCode)
	}
}

// --- DeleteBucket ---

func TestDeleteBucket_Success(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.DeleteBucketFn = func(_ context.Context, id string) error {
		if id != "id-1" {
			t.Errorf("DeleteBucket id = %q, want id-1", id)
		}
		return nil
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/buckets/alpha", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestDeleteBucket_RecursiveEmptiesBucketFirst(t *testing.T) {
	admin := &mocks.AdminMock{}
	app, s3 := newBucketsTestAppWithS3(t, admin)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	s3.DeleteAllObjectsFn = func(_ context.Context, bucket string) (int, error) {
		if bucket != "alpha" {
			t.Errorf("DeleteAllObjects bucket = %q, want alpha", bucket)
		}
		return 19, nil
	}
	admin.DeleteBucketFn = func(_ context.Context, _ string) error {
		if len(s3.Calls) != 1 || s3.Calls[0].Method != "DeleteAllObjects" {
			t.Errorf("DeleteBucket called before bucket contents were removed")
		}
		return nil
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/buckets/alpha?recursive=true", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
	var body struct {
		Data struct {
			DeletedObjects int `json:"deletedObjects"`
		} `json:"data"`
	}
	decodeJSON(t, resp.Body, &body)
	if body.Data.DeletedObjects != 19 {
		t.Fatalf("deletedObjects = %d, want 19", body.Data.DeletedObjects)
	}
}

func TestDeleteBucket_RecursiveStopsWhenEmptyingFails(t *testing.T) {
	admin := &mocks.AdminMock{}
	app, s3 := newBucketsTestAppWithS3(t, admin)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	s3.DeleteAllObjectsFn = func(_ context.Context, _ string) (int, error) {
		return 0, errors.New("cannot list objects")
	}
	admin.DeleteBucketFn = func(_ context.Context, _ string) error {
		t.Fatal("DeleteBucket must not run after emptying fails")
		return nil
	}

	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/buckets/alpha?recursive=true", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.StatusCode)
	}
}

func TestDeleteBucket_NotFound(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return nil, nil
	}
	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/buckets/missing", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestDeleteBucket_AdminDeleteErrorReturns500(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.DeleteBucketFn = func(_ context.Context, _ string) error { return errors.New("boom") }
	resp, err := app.Test(httptest.NewRequest(http.MethodDelete, "/buckets/alpha", nil))
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("status = %d, want 500", resp.StatusCode)
	}
}

// --- GrantBucketPermission ---

func TestGrantBucketPermission_Success(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.AllowBucketKeyFn = func(_ context.Context, req models.BucketKeyPermRequest) (*models.GarageBucketInfo, error) {
		if req.BucketID != "id-1" || req.AccessKeyID != "AKIA" {
			t.Errorf("allow req = %+v", req)
		}
		if !req.Permissions.Read || !req.Permissions.Write || req.Permissions.Owner {
			t.Errorf("allow perms = %+v", req.Permissions)
		}
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.DenyBucketKeyFn = func(_ context.Context, req models.BucketKeyPermRequest) (*models.GarageBucketInfo, error) {
		if req.BucketID != "id-1" || req.AccessKeyID != "AKIA" {
			t.Errorf("deny req = %+v", req)
		}
		if req.Permissions.Read || req.Permissions.Write || !req.Permissions.Owner {
			t.Errorf("deny perms = %+v", req.Permissions)
		}
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	body, _ := json.Marshal(models.GrantBucketPermissionRequest{
		AccessKeyID: "AKIA",
		Permissions: models.BucketKeyPermission{Read: true, Write: true},
	})
	req := httptest.NewRequest(http.MethodPost, "/buckets/alpha/permissions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestGrantBucketPermission_MissingAccessKey400(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	body, _ := json.Marshal(map[string]any{"accessKeyId": "", "permissions": map[string]bool{"read": true}})
	req := httptest.NewRequest(http.MethodPost, "/buckets/alpha/permissions", bytes.NewReader(body))
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

func TestGrantBucketPermission_BucketNotFound404(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return nil, nil
	}
	body, _ := json.Marshal(models.GrantBucketPermissionRequest{AccessKeyID: "AKIA"})
	req := httptest.NewRequest(http.MethodPost, "/buckets/missing/permissions", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

// --- UpdateBucketWebsite ---

func TestUpdateBucketWebsite_EnableWithIndexDocument(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.UpdateBucketFn = func(_ context.Context, id string, req models.UpdateBucketRequest) (*models.GarageBucketInfo, error) {
		if req.WebsiteAccess == nil || !req.WebsiteAccess.Enabled {
			t.Errorf("WebsiteAccess = %+v", req.WebsiteAccess)
		}
		if req.WebsiteAccess.IndexDocument == nil || *req.WebsiteAccess.IndexDocument != "index.html" {
			t.Errorf("IndexDocument = %v", req.WebsiteAccess.IndexDocument)
		}
		return &models.GarageBucketInfo{ID: id, WebsiteAccess: true}, nil
	}
	body, _ := json.Marshal(models.UpdateBucketWebsiteRequest{Enabled: true, IndexDocument: "index.html"})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/website", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestUpdateBucketWebsite_EnableWithoutIndexDocumentReturns400(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	body, _ := json.Marshal(models.UpdateBucketWebsiteRequest{Enabled: true})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/website", bytes.NewReader(body))
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

func TestUpdateBucketWebsite_Disable(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.UpdateBucketFn = func(_ context.Context, _ string, req models.UpdateBucketRequest) (*models.GarageBucketInfo, error) {
		if req.WebsiteAccess == nil || req.WebsiteAccess.Enabled {
			t.Errorf("expected Enabled=false, got %+v", req.WebsiteAccess)
		}
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	body, _ := json.Marshal(models.UpdateBucketWebsiteRequest{Enabled: false})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/website", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d", resp.StatusCode)
	}
}

func TestUpdateBucketQuotas_SetBoth(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.UpdateBucketFn = func(_ context.Context, id string, req models.UpdateBucketRequest) (*models.GarageBucketInfo, error) {
		if req.Quotas == nil {
			t.Fatalf("Quotas = nil, want non-nil")
		}
		if req.Quotas.MaxSize == nil || *req.Quotas.MaxSize != 53687091200 {
			t.Errorf("MaxSize = %v, want 53687091200", req.Quotas.MaxSize)
		}
		if req.Quotas.MaxObjects == nil || *req.Quotas.MaxObjects != 10000 {
			t.Errorf("MaxObjects = %v, want 10000", req.Quotas.MaxObjects)
		}
		return &models.GarageBucketInfo{ID: id, Quotas: req.Quotas}, nil
	}

	maxSize := int64(53687091200)
	maxObjects := int64(10000)
	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{MaxSize: &maxSize, MaxObjects: &maxObjects})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestUpdateBucketQuotas_SetOnlyMaxSize(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.UpdateBucketFn = func(_ context.Context, id string, req models.UpdateBucketRequest) (*models.GarageBucketInfo, error) {
		if req.Quotas == nil {
			t.Fatalf("Quotas = nil, want non-nil")
		}
		if req.Quotas.MaxSize == nil || *req.Quotas.MaxSize != 1024 {
			t.Errorf("MaxSize = %v, want 1024", req.Quotas.MaxSize)
		}
		if req.Quotas.MaxObjects != nil {
			t.Errorf("MaxObjects = %v, want nil", req.Quotas.MaxObjects)
		}
		return &models.GarageBucketInfo{ID: id, Quotas: req.Quotas}, nil
	}

	maxSize := int64(1024)
	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{MaxSize: &maxSize})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestUpdateBucketQuotas_SetOnlyMaxObjects(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.UpdateBucketFn = func(_ context.Context, id string, req models.UpdateBucketRequest) (*models.GarageBucketInfo, error) {
		if req.Quotas == nil {
			t.Fatalf("Quotas = nil, want non-nil")
		}
		if req.Quotas.MaxObjects == nil || *req.Quotas.MaxObjects != 500 {
			t.Errorf("MaxObjects = %v, want 500", req.Quotas.MaxObjects)
		}
		if req.Quotas.MaxSize != nil {
			t.Errorf("MaxSize = %v, want nil", req.Quotas.MaxSize)
		}
		return &models.GarageBucketInfo{ID: id, Quotas: req.Quotas}, nil
	}

	maxObjects := int64(500)
	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{MaxObjects: &maxObjects})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestUpdateBucketQuotas_ClearBoth(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return &models.GarageBucketInfo{ID: "id-1"}, nil
	}
	admin.UpdateBucketFn = func(_ context.Context, id string, req models.UpdateBucketRequest) (*models.GarageBucketInfo, error) {
		if req.Quotas == nil {
			t.Fatalf("Quotas = nil, want non-nil (envelope must be present so service clears both)")
		}
		if req.Quotas.MaxSize != nil {
			t.Errorf("MaxSize = %v, want nil", req.Quotas.MaxSize)
		}
		if req.Quotas.MaxObjects != nil {
			t.Errorf("MaxObjects = %v, want nil", req.Quotas.MaxObjects)
		}
		return &models.GarageBucketInfo{ID: id}, nil
	}

	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200", resp.StatusCode)
	}
}

func TestUpdateBucketQuotas_RejectsZeroMaxSize(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	zero := int64(0)
	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{MaxSize: &zero})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader(body))
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

func TestUpdateBucketQuotas_RejectsNegativeMaxObjects(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	neg := int64(-1)
	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{MaxObjects: &neg})
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader(body))
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

func TestUpdateBucketQuotas_NotFound(t *testing.T) {
	app, admin := newBucketsTestApp(t)
	admin.GetBucketInfoByAliasFn = func(_ context.Context, _ string) (*models.GarageBucketInfo, error) {
		return nil, nil
	}
	maxSize := int64(1024)
	body, _ := json.Marshal(models.UpdateBucketQuotasRequest{MaxSize: &maxSize})
	req := httptest.NewRequest(http.MethodPut, "/buckets/missing/quotas", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", resp.StatusCode)
	}
}

func TestUpdateBucketQuotas_MalformedJSONReturns400(t *testing.T) {
	app, _ := newBucketsTestApp(t)
	req := httptest.NewRequest(http.MethodPut, "/buckets/alpha/quotas", bytes.NewReader([]byte("{not json")))
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
