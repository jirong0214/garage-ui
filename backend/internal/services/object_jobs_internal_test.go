package services

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"
)

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
