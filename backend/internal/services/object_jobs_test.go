package services_test

import (
	"context"
	"errors"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"
	"Noooste/garage-ui/internal/services"
	"Noooste/garage-ui/internal/services/mocks"
)

func newJobManager(t *testing.T, s3 services.S3Storage) *services.ObjectJobManager {
	t.Helper()
	manager, err := services.NewObjectJobManager(s3, config.ObjectJobConfig{
		Enabled: true, DatabasePath: filepath.Join(t.TempDir(), "jobs.db"),
		Concurrency: 1, MaxActive: 1, Retention: time.Hour,
	})
	if err != nil {
		t.Fatalf("NewObjectJobManager: %v", err)
	}
	t.Cleanup(func() {
		if err := manager.Close(); err != nil {
			t.Errorf("Close: %v", err)
		}
	})
	return manager
}

func waitForJob(t *testing.T, manager *services.ObjectJobManager, id string) *models.ObjectJob {
	t.Helper()
	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		job, err := manager.Get(id)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		switch job.Status {
		case models.ObjectJobStatusCompleted, models.ObjectJobStatusCompletedWithErrors,
			models.ObjectJobStatusFailed, models.ObjectJobStatusCancelled:
			return job
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for object job")
	return nil
}

func TestObjectJobManagerCopiesObjectsAndRecursivePrefixes(t *testing.T) {
	var copied [][2]string
	s3 := &mocks.S3Mock{
		GetObjectMetadataFn: func(_ context.Context, _, key string) (*models.ObjectInfo, error) {
			return &models.ObjectInfo{Key: key, Size: 10}, nil
		},
		ListObjectsRecursiveFn: func(_ context.Context, _, prefix string, _ int, _ string) (*services.RecursiveObjectPage, error) {
			if prefix != "album/" {
				t.Fatalf("prefix = %q", prefix)
			}
			return &services.RecursiveObjectPage{Objects: []models.ObjectInfo{
				{Key: "album/a.jpg", Size: 20},
				{Key: "album/nested/b.jpg", Size: 30},
			}}, nil
		},
		CopyObjectFn: func(_ context.Context, _, source, _, destination string, _ bool) (*models.ObjectTransferResponse, error) {
			copied = append(copied, [2]string{source, destination})
			return &models.ObjectTransferResponse{}, nil
		},
	}
	manager := newJobManager(t, s3)
	job, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation: models.ObjectJobOperationCopy, SourceBucket: "pics",
		Objects: []string{"loose.jpg"}, Prefixes: []string{"album/"},
		DestinationBucket: "backup", DestinationPrefix: "imports",
	}, "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	job = waitForJob(t, manager, job.ID)
	if job.Status != models.ObjectJobStatusCompleted || job.Discovered != 3 || job.Succeeded != 3 || job.Progress != 100 {
		t.Fatalf("unexpected job: %+v", job)
	}
	want := map[[2]string]bool{
		{"loose.jpg", "imports/loose.jpg"}:                   true,
		{"album/a.jpg", "imports/album/a.jpg"}:               true,
		{"album/nested/b.jpg", "imports/album/nested/b.jpg"}: true,
	}
	for _, pair := range copied {
		delete(want, pair)
	}
	if len(want) != 0 {
		t.Fatalf("missing copies: %v; got %v", want, copied)
	}
}

func TestObjectJobManagerSkipsConflictsAndReportsFailures(t *testing.T) {
	s3 := &mocks.S3Mock{
		GetObjectMetadataFn: func(_ context.Context, _, key string) (*models.ObjectInfo, error) {
			return &models.ObjectInfo{Key: key, Size: 1}, nil
		},
		CopyObjectFn: func(_ context.Context, _, source, _, _ string, _ bool) (*models.ObjectTransferResponse, error) {
			if source == "exists.jpg" {
				return nil, services.ErrTransferDestinationExists
			}
			return nil, errors.New("copy failed")
		},
	}
	manager := newJobManager(t, s3)
	job, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation: models.ObjectJobOperationCopy, SourceBucket: "pics",
		Objects:           []string{"exists.jpg", "broken.jpg"},
		DestinationBucket: "backup", ConflictPolicy: models.ObjectJobConflictSkip,
	}, "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	job = waitForJob(t, manager, job.ID)
	if job.Status != models.ObjectJobStatusCompletedWithErrors || job.Skipped != 1 || job.Failed != 1 {
		t.Fatalf("unexpected job: %+v", job)
	}
	failures, err := manager.Failures(job.ID, 0, 10)
	if err != nil {
		t.Fatalf("Failures: %v", err)
	}
	if failures.Total != 1 || failures.Failures[0].SourceKey != "broken.jpg" {
		t.Fatalf("unexpected failures: %+v", failures)
	}
}

func TestObjectJobManagerMovesAndDeletesSelections(t *testing.T) {
	var mu sync.Mutex
	var moved, deleted []string
	s3 := &mocks.S3Mock{
		GetObjectMetadataFn: func(_ context.Context, _, key string) (*models.ObjectInfo, error) {
			return &models.ObjectInfo{Key: key, Size: 1}, nil
		},
		ListObjectsRecursiveFn: func(_ context.Context, _, prefix string, _ int, _ string) (*services.RecursiveObjectPage, error) {
			return &services.RecursiveObjectPage{Objects: []models.ObjectInfo{{Key: prefix + "child.txt", Size: 2}}}, nil
		},
		CopyObjectFn: func(_ context.Context, _, source, _, destination string, _ bool) (*models.ObjectTransferResponse, error) {
			mu.Lock()
			moved = append(moved, source+"->"+destination)
			mu.Unlock()
			return &models.ObjectTransferResponse{}, nil
		},
		DeleteObjectFn: func(_ context.Context, _, key string) error {
			mu.Lock()
			deleted = append(deleted, key)
			mu.Unlock()
			return nil
		},
	}
	manager := newJobManager(t, s3)
	move, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation: models.ObjectJobOperationMove, SourceBucket: "pics", Prefixes: []string{"folder"},
		DestinationBucket: "archive", DestinationPrefix: "moved",
	}, "")
	if err != nil {
		t.Fatalf("create move: %v", err)
	}
	if completed := waitForJob(t, manager, move.ID); completed.Succeeded != 1 {
		t.Fatalf("move job: %+v", completed)
	}
	del, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation: models.ObjectJobOperationDelete, SourceBucket: "pics",
		Objects: []string{"loose.txt"}, Prefixes: []string{"trash/"},
	}, "")
	if err != nil {
		t.Fatalf("create delete: %v", err)
	}
	if completed := waitForJob(t, manager, del.ID); completed.Succeeded != 2 {
		t.Fatalf("delete job: %+v", completed)
	}
	if len(moved) != 1 || moved[0] != "folder/child.txt->moved/folder/child.txt" {
		t.Fatalf("moved = %v", moved)
	}
	if len(deleted) != 3 {
		t.Fatalf("deleted = %v", deleted)
	}
}

func TestObjectJobRequestRejectsDestinationInsideSource(t *testing.T) {
	s3 := &mocks.S3Mock{}
	manager := newJobManager(t, s3)
	_, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation: models.ObjectJobOperationMove, SourceBucket: "pics", Prefixes: []string{"folder/"},
		DestinationBucket: "pics", DestinationPrefix: "folder/child/",
	}, "")
	if err == nil {
		t.Fatal("expected descendant destination error")
	}
}

func TestObjectJobRequestRejectsObjectMappedOntoItself(t *testing.T) {
	manager := newJobManager(t, &mocks.S3Mock{})
	_, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation:    models.ObjectJobOperationCopy,
		SourceBucket: "pics", Objects: []string{"folder/photo.jpg"},
		DestinationBucket: "pics", DestinationPrefix: "folder/",
	}, "")
	if err == nil {
		t.Fatal("expected same-object destination error")
	}
}

func TestObjectJobCreateIsIdempotentPerOwner(t *testing.T) {
	s3 := &mocks.S3Mock{
		GetObjectMetadataFn: func(_ context.Context, _, key string) (*models.ObjectInfo, error) {
			return &models.ObjectInfo{Key: key, Size: 1}, nil
		},
		DeleteObjectFn: func(_ context.Context, _, _ string) error {
			return nil
		},
	}
	manager := newJobManager(t, s3)
	request := models.CreateObjectJobRequest{
		Operation:    models.ObjectJobOperationDelete,
		SourceBucket: "pics",
		Objects:      []string{"old.jpg"},
	}
	first, err := manager.Create(context.Background(), "alice", request, "request-123")
	if err != nil {
		t.Fatalf("first Create: %v", err)
	}
	second, err := manager.Create(context.Background(), "alice", request, "request-123")
	if err != nil {
		t.Fatalf("second Create: %v", err)
	}
	if first.ID != second.ID {
		t.Fatalf("idempotent IDs differ: %q != %q", first.ID, second.ID)
	}
	otherOwner, err := manager.Create(context.Background(), "bob", request, "request-123")
	if err != nil {
		t.Fatalf("other owner Create: %v", err)
	}
	if otherOwner.ID == first.ID {
		t.Fatal("idempotency keys must be scoped to the owner")
	}
}

func TestObjectJobManagerCancelsRunningJob(t *testing.T) {
	copyStarted := make(chan struct{})
	var once sync.Once
	s3 := &mocks.S3Mock{
		GetObjectMetadataFn: func(_ context.Context, _, key string) (*models.ObjectInfo, error) {
			return &models.ObjectInfo{Key: key, Size: 1}, nil
		},
		CopyObjectFn: func(ctx context.Context, _, _, _, _ string, _ bool) (*models.ObjectTransferResponse, error) {
			once.Do(func() { close(copyStarted) })
			<-ctx.Done()
			return nil, ctx.Err()
		},
	}
	manager := newJobManager(t, s3)
	job, err := manager.Create(context.Background(), "alice", models.CreateObjectJobRequest{
		Operation:    models.ObjectJobOperationCopy,
		SourceBucket: "pics", Objects: []string{"slow.jpg"},
		DestinationBucket: "archive",
	}, "")
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	select {
	case <-copyStarted:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for copy to start")
	}
	cancelling, err := manager.Cancel(job.ID)
	if err != nil {
		t.Fatalf("Cancel: %v", err)
	}
	if cancelling.Status != models.ObjectJobStatusCancelling || !cancelling.CancelRequested {
		t.Fatalf("cancelling job = %+v", cancelling)
	}
	completed := waitForJob(t, manager, job.ID)
	if completed.Status != models.ObjectJobStatusCancelled {
		t.Fatalf("completed job = %+v", completed)
	}
}
