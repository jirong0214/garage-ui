package models

import "time"

const (
	ObjectJobOperationCopy   = "copy"
	ObjectJobOperationMove   = "move"
	ObjectJobOperationDelete = "delete"

	ObjectJobConflictSkip      = "skip"
	ObjectJobConflictOverwrite = "overwrite"

	ObjectJobStatusQueued              = "queued"
	ObjectJobStatusScanning            = "scanning"
	ObjectJobStatusRunning             = "running"
	ObjectJobStatusCancelling          = "cancelling"
	ObjectJobStatusCompleted           = "completed"
	ObjectJobStatusCompletedWithErrors = "completed_with_errors"
	ObjectJobStatusFailed              = "failed"
	ObjectJobStatusCancelled           = "cancelled"
)

// CreateObjectJobRequest selects explicit objects and recursive prefixes from
// one source bucket. Copy and move jobs place every selected top-level item
// under DestinationPrefix.
type CreateObjectJobRequest struct {
	Operation         string   `json:"operation" validate:"required"`
	SourceBucket      string   `json:"sourceBucket" validate:"required"`
	Objects           []string `json:"objects,omitempty"`
	Prefixes          []string `json:"prefixes,omitempty"`
	DestinationBucket string   `json:"destinationBucket,omitempty"`
	DestinationPrefix string   `json:"destinationPrefix,omitempty"`
	ConflictPolicy    string   `json:"conflictPolicy,omitempty"`
}

// ObjectJob is the durable aggregate returned by the object-job API.
type ObjectJob struct {
	ID                string     `json:"id"`
	Owner             string     `json:"owner,omitempty"`
	Operation         string     `json:"operation"`
	Status            string     `json:"status"`
	Phase             string     `json:"phase"`
	SourceBucket      string     `json:"sourceBucket"`
	Objects           []string   `json:"objects,omitempty"`
	Prefixes          []string   `json:"prefixes,omitempty"`
	DestinationBucket string     `json:"destinationBucket,omitempty"`
	DestinationPrefix string     `json:"destinationPrefix,omitempty"`
	ConflictPolicy    string     `json:"conflictPolicy,omitempty"`
	Discovered        int64      `json:"discovered"`
	Processed         int64      `json:"processed"`
	Succeeded         int64      `json:"succeeded"`
	Failed            int64      `json:"failed"`
	Skipped           int64      `json:"skipped"`
	BytesProcessed    int64      `json:"bytesProcessed"`
	BytesTotal        int64      `json:"bytesTotal"`
	Progress          float64    `json:"progress"`
	CurrentKey        string     `json:"currentKey,omitempty"`
	Error             string     `json:"error,omitempty"`
	CancelRequested   bool       `json:"cancelRequested,omitempty"`
	CreatedAt         time.Time  `json:"createdAt"`
	StartedAt         *time.Time `json:"startedAt,omitempty"`
	FinishedAt        *time.Time `json:"finishedAt,omitempty"`
}

// ObjectJobFailure is one failed concrete object operation.
type ObjectJobFailure struct {
	SourceKey      string `json:"sourceKey"`
	DestinationKey string `json:"destinationKey,omitempty"`
	Error          string `json:"error"`
}

type ObjectJobFailureList struct {
	Failures   []ObjectJobFailure `json:"failures"`
	Offset     int                `json:"offset"`
	Limit      int                `json:"limit"`
	Total      int                `json:"total"`
	NextOffset *int               `json:"nextOffset,omitempty"`
}

type ObjectJobList struct {
	Jobs  []ObjectJob `json:"jobs"`
	Count int         `json:"count"`
}
