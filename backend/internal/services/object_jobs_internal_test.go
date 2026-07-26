package services

import (
	"context"
	"path/filepath"
	"reflect"
	"testing"
	"time"

	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"
)

func TestNormalizeObjectJobRequestPreservesOpaqueKeys(t *testing.T) {
	req := models.CreateObjectJobRequest{
		Operation:         models.ObjectJobOperationCopy,
		SourceBucket:      "source",
		Objects:           []string{" leading.txt", "/root.txt", "trailing.txt ", "a+b#?%.txt", "中文.txt"},
		Prefixes:          []string{" folder ", "/root-prefix", "目录"},
		DestinationBucket: "destination",
		DestinationPrefix: " target ",
	}
	if err := normalizeObjectJobRequest(&req); err != nil {
		t.Fatalf("normalizeObjectJobRequest: %v", err)
	}

	wantObjects := []string{" leading.txt", "/root.txt", "trailing.txt ", "a+b#?%.txt", "中文.txt"}
	wantPrefixes := []string{" folder /", "/root-prefix/", "目录/"}
	if !reflect.DeepEqual(req.Objects, wantObjects) {
		t.Errorf("objects = %#v, want exact %#v", req.Objects, wantObjects)
	}
	if !reflect.DeepEqual(req.Prefixes, wantPrefixes) {
		t.Errorf("prefixes = %#v, want exact %#v", req.Prefixes, wantPrefixes)
	}
	if req.DestinationPrefix != " target /" {
		t.Errorf("destinationPrefix = %q, want exact key prefix with trailing slash", req.DestinationPrefix)
	}
}

type resumeMoveS3 struct {
	S3Storage
	copyCalls   int
	deleteCalls int
}

func (s *resumeMoveS3) CopyObject(context.Context, string, string, string, string, bool) (*models.ObjectTransferResponse, error) {
	s.copyCalls++
	return &models.ObjectTransferResponse{}, nil
}

func (s *resumeMoveS3) DeleteObject(context.Context, string, string) error {
	s.deleteCalls++
	return nil
}

func TestObjectJobMoveResumesFromPersistedCopyStage(t *testing.T) {
	s3 := &resumeMoveS3{}
	manager, err := NewObjectJobManager(s3, config.ObjectJobConfig{
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

	job := &models.ObjectJob{
		ID: "resume-move", Owner: "alice",
		Operation: models.ObjectJobOperationMove,
		Status:    models.ObjectJobStatusQueued, Phase: "queued",
		SourceBucket: "pics", DestinationBucket: "archive",
		CreatedAt: time.Now().UTC(),
	}
	if err := manager.store.saveJob(job); err != nil {
		t.Fatalf("save job: %v", err)
	}
	if err := manager.store.putTasks(job.ID, []objectJobTask{{
		SourceKey: "source.jpg", DestinationKey: "target.jpg",
		Size: 1, Status: "copied",
	}}); err != nil {
		t.Fatalf("save task: %v", err)
	}
	manager.enqueue(job.ID)

	deadline := time.Now().Add(3 * time.Second)
	for time.Now().Before(deadline) {
		completed, err := manager.Get(job.ID)
		if err != nil {
			t.Fatalf("Get: %v", err)
		}
		if completed.Status == models.ObjectJobStatusCompleted {
			if completed.Succeeded != 1 {
				t.Fatalf("unexpected resumed job: %+v", completed)
			}
			if s3.copyCalls != 0 || s3.deleteCalls != 1 {
				t.Fatalf("copy calls = %d, delete calls = %d", s3.copyCalls, s3.deleteCalls)
			}
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatal("timed out waiting for resumed move")
}
