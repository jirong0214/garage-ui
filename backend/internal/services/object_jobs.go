package services

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"Noooste/garage-ui/internal/config"
	"Noooste/garage-ui/internal/models"

	"github.com/google/uuid"
)

type ObjectJobService interface {
	Create(ctx context.Context, owner string, req models.CreateObjectJobRequest, idempotencyKey string) (*models.ObjectJob, error)
	Get(id string) (*models.ObjectJob, error)
	List(owner string, includeAll bool, limit int) ([]models.ObjectJob, error)
	Failures(id string, offset, limit int) (*models.ObjectJobFailureList, error)
	Cancel(id string) (*models.ObjectJob, error)
	Close() error
}

type ObjectJobManager struct {
	s3        S3Storage
	store     *objectJobStore
	cfg       config.ObjectJobConfig
	ctx       context.Context
	cancel    context.CancelFunc
	queue     chan string
	wg        sync.WaitGroup
	cancelMu  sync.Mutex
	jobCancel map[string]context.CancelFunc
}

func NewObjectJobManager(s3 S3Storage, cfg config.ObjectJobConfig) (*ObjectJobManager, error) {
	store, err := openObjectJobStore(cfg.DatabasePath)
	if err != nil {
		return nil, err
	}
	ctx, cancel := context.WithCancel(context.Background())
	m := &ObjectJobManager{
		s3: s3, store: store, cfg: cfg, ctx: ctx, cancel: cancel,
		queue: make(chan string, 128), jobCancel: map[string]context.CancelFunc{},
	}
	if err := store.deleteExpired(time.Now().Add(-cfg.Retention)); err != nil {
		_ = store.Close()
		cancel()
		return nil, fmt.Errorf("clean expired object jobs: %w", err)
	}
	jobs, err := store.listJobs("", 0)
	if err != nil {
		_ = store.Close()
		cancel()
		return nil, fmt.Errorf("recover object jobs: %w", err)
	}
	for i := 0; i < cfg.MaxActive; i++ {
		m.wg.Add(1)
		go m.worker()
	}
	for i := range jobs {
		if isTerminalJobStatus(jobs[i].Status) {
			continue
		}
		jobs[i].Status = models.ObjectJobStatusQueued
		jobs[i].Phase = "queued"
		jobs[i].CancelRequested = false
		if err := store.saveJob(&jobs[i]); err == nil {
			m.enqueue(jobs[i].ID)
		}
	}
	return m, nil
}

func (m *ObjectJobManager) Close() error {
	m.cancel()
	m.cancelMu.Lock()
	for _, cancel := range m.jobCancel {
		cancel()
	}
	m.cancelMu.Unlock()
	m.wg.Wait()
	return m.store.Close()
}

func (m *ObjectJobManager) Create(_ context.Context, owner string, req models.CreateObjectJobRequest, idempotencyKey string) (*models.ObjectJob, error) {
	if err := normalizeObjectJobRequest(&req); err != nil {
		return nil, err
	}
	id := uuid.NewString()
	if idempotencyKey != "" {
		id = uuid.NewSHA1(uuid.NameSpaceURL, []byte(owner+"\x00"+idempotencyKey)).String()
		existing, err := m.store.getJob(id)
		if err == nil {
			return existing, nil
		}
		if !errors.Is(err, ErrObjectJobNotFound) {
			return nil, err
		}
	}
	job := &models.ObjectJob{
		ID: id, Owner: owner, Operation: req.Operation,
		Status: models.ObjectJobStatusQueued, Phase: "queued",
		SourceBucket: req.SourceBucket, Objects: req.Objects, Prefixes: req.Prefixes,
		DestinationBucket: req.DestinationBucket, DestinationPrefix: req.DestinationPrefix,
		ConflictPolicy: req.ConflictPolicy, CreatedAt: time.Now().UTC(),
	}
	created, err := m.store.createJob(job)
	if err != nil {
		return nil, err
	}
	if !created {
		return m.store.getJob(job.ID)
	}
	m.enqueue(job.ID)
	return job, nil
}

func (m *ObjectJobManager) Get(id string) (*models.ObjectJob, error) {
	return m.store.getJob(id)
}

func (m *ObjectJobManager) List(owner string, includeAll bool, limit int) ([]models.ObjectJob, error) {
	if includeAll {
		owner = ""
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	return m.store.listJobs(owner, limit)
}

func (m *ObjectJobManager) Failures(id string, offset, limit int) (*models.ObjectJobFailureList, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	failures, total, err := m.store.failures(id, offset, limit)
	if err != nil {
		return nil, err
	}
	result := &models.ObjectJobFailureList{Failures: failures, Offset: offset, Limit: limit, Total: total}
	if offset+len(failures) < total {
		next := offset + len(failures)
		result.NextOffset = &next
	}
	return result, nil
}

func (m *ObjectJobManager) Cancel(id string) (*models.ObjectJob, error) {
	job, err := m.store.getJob(id)
	if err != nil {
		return nil, err
	}
	if isTerminalJobStatus(job.Status) {
		return job, nil
	}
	job.CancelRequested = true
	job.Status = models.ObjectJobStatusCancelling
	job.Phase = "cancelling"
	if err := m.store.saveJob(job); err != nil {
		return nil, err
	}
	m.cancelMu.Lock()
	if cancel := m.jobCancel[id]; cancel != nil {
		cancel()
	}
	m.cancelMu.Unlock()
	return job, nil
}

func (m *ObjectJobManager) enqueue(id string) {
	select {
	case m.queue <- id:
	default:
		go func() {
			select {
			case m.queue <- id:
			case <-m.ctx.Done():
			}
		}()
	}
}

func (m *ObjectJobManager) worker() {
	defer m.wg.Done()
	for {
		select {
		case <-m.ctx.Done():
			return
		case id := <-m.queue:
			m.runJob(id)
		}
	}
}

func (m *ObjectJobManager) runJob(id string) {
	job, err := m.store.getJob(id)
	if err != nil || isTerminalJobStatus(job.Status) {
		return
	}
	if job.CancelRequested || job.Status == models.ObjectJobStatusCancelling {
		m.finishJob(job, models.ObjectJobStatusCancelled, "")
		return
	}
	ctx, cancel := context.WithCancel(m.ctx)
	m.cancelMu.Lock()
	m.jobCancel[id] = cancel
	m.cancelMu.Unlock()
	defer func() {
		cancel()
		m.cancelMu.Lock()
		delete(m.jobCancel, id)
		m.cancelMu.Unlock()
	}()

	now := time.Now().UTC()
	if job.StartedAt == nil {
		job.StartedAt = &now
	}
	job.Status = models.ObjectJobStatusScanning
	job.Phase = "scanning"
	job.Error = ""
	if err := m.store.saveJob(job); err != nil {
		return
	}
	if err := m.scanJob(ctx, job); err != nil {
		m.finishJob(job, models.ObjectJobStatusFailed, err.Error())
		return
	}
	if ctx.Err() != nil {
		m.finishJob(job, models.ObjectJobStatusCancelled, "")
		return
	}

	tasks, err := m.store.listTasks(job.ID)
	if err != nil {
		m.finishJob(job, models.ObjectJobStatusFailed, err.Error())
		return
	}
	m.recalculateJob(job, tasks)
	job.Status = models.ObjectJobStatusRunning
	job.Phase = job.Operation
	if err := m.store.saveJob(job); err != nil {
		return
	}
	m.executeTasks(ctx, job, tasks)
	if ctx.Err() != nil {
		m.finishJob(job, models.ObjectJobStatusCancelled, "")
		return
	}
	if job.Failed > 0 {
		m.finishJob(job, models.ObjectJobStatusCompletedWithErrors, "")
	} else {
		m.finishJob(job, models.ObjectJobStatusCompleted, "")
	}
}

func (m *ObjectJobManager) scanJob(ctx context.Context, job *models.ObjectJob) error {
	existing, err := m.store.listTasks(job.ID)
	if err != nil {
		return err
	}
	taskBySource := make(map[string]objectJobTask, len(existing))
	destinationSources := map[string]string{}
	for _, task := range existing {
		if task.Status == "running" {
			task.Status = "pending"
		}
		taskBySource[task.SourceKey] = task
		if task.DestinationKey != "" {
			destinationSources[task.DestinationKey] = task.SourceKey
		}
	}
	add := func(key, destination string, size int64) {
		if _, exists := taskBySource[key]; exists {
			return
		}
		task := objectJobTask{SourceKey: key, DestinationKey: destination, Size: size, Status: "pending"}
		if other, duplicate := destinationSources[destination]; destination != "" && duplicate && other != key {
			task.Status = "failed"
			task.Error = "multiple selected objects map to the same destination"
		}
		taskBySource[key] = task
		if destination != "" {
			destinationSources[destination] = key
		}
	}

	for _, key := range job.Objects {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		info, err := m.s3.GetObjectMetadata(ctx, job.SourceBucket, key)
		if err != nil {
			if _, exists := taskBySource[key]; exists {
				continue
			}
			add(key, m.objectDestination(job, key), 0)
			task := taskBySource[key]
			task.Status, task.Error = "failed", "source object not found: "+err.Error()
			taskBySource[key] = task
			continue
		}
		add(key, m.objectDestination(job, key), info.Size)
	}
	for _, prefix := range job.Prefixes {
		token := ""
		for {
			page, err := m.s3.ListObjectsRecursive(ctx, job.SourceBucket, prefix, 1000, token)
			if err != nil {
				return err
			}
			for _, object := range page.Objects {
				add(object.Key, m.prefixDestination(job, prefix, object.Key), object.Size)
			}
			if !page.IsTruncated || page.NextContinuationToken == "" {
				break
			}
			token = page.NextContinuationToken
		}
	}
	tasks := make([]objectJobTask, 0, len(taskBySource))
	for _, task := range taskBySource {
		tasks = append(tasks, task)
	}
	if len(tasks) == 0 {
		return fmt.Errorf("no source objects were found")
	}
	return m.store.putTasks(job.ID, tasks)
}

func (m *ObjectJobManager) executeTasks(ctx context.Context, job *models.ObjectJob, tasks []objectJobTask) {
	workers := m.cfg.Concurrency
	if workers > len(tasks) {
		workers = len(tasks)
	}
	work := make(chan objectJobTask)
	var wg sync.WaitGroup
	var aggregateMu sync.Mutex
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for task := range work {
				if ctx.Err() != nil {
					return
				}
				if task.Status == "succeeded" || task.Status == "skipped" || task.Status == "failed" {
					continue
				}
				if task.Status != "copied" {
					task.Status = "running"
					_ = m.store.updateTask(job.ID, task)
				}
				status, taskErr := m.executeTask(ctx, job, task)
				task.Status = status
				if taskErr != nil {
					task.Error = taskErr.Error()
				} else {
					task.Error = ""
				}
				_ = m.store.updateTask(job.ID, task)

				aggregateMu.Lock()
				job.Processed++
				job.BytesProcessed += task.Size
				job.CurrentKey = task.SourceKey
				switch status {
				case "succeeded":
					job.Succeeded++
				case "skipped":
					job.Skipped++
				case "failed":
					job.Failed++
				}
				job.Progress = progress(job.Processed, job.Discovered)
				_ = m.store.saveJob(job)
				aggregateMu.Unlock()
			}
		}()
	}
	for _, task := range tasks {
		if task.Status == "succeeded" || task.Status == "skipped" || task.Status == "failed" {
			continue
		}
		select {
		case work <- task:
		case <-ctx.Done():
			close(work)
			wg.Wait()
			return
		}
	}
	close(work)
	wg.Wait()
}

func (m *ObjectJobManager) executeTask(ctx context.Context, job *models.ObjectJob, task objectJobTask) (string, error) {
	switch job.Operation {
	case models.ObjectJobOperationDelete:
		if err := m.s3.DeleteObject(ctx, job.SourceBucket, task.SourceKey); err != nil {
			return "failed", err
		}
		return "succeeded", nil
	case models.ObjectJobOperationCopy:
		_, err := m.s3.CopyObject(ctx, job.SourceBucket, task.SourceKey, job.DestinationBucket, task.DestinationKey, job.ConflictPolicy == models.ObjectJobConflictOverwrite)
		if errors.Is(err, ErrTransferDestinationExists) && job.ConflictPolicy == models.ObjectJobConflictSkip {
			return "skipped", nil
		}
		if err != nil {
			return "failed", err
		}
		return "succeeded", nil
	case models.ObjectJobOperationMove:
		if task.Status != "copied" {
			_, err := m.s3.CopyObject(ctx, job.SourceBucket, task.SourceKey, job.DestinationBucket, task.DestinationKey, job.ConflictPolicy == models.ObjectJobConflictOverwrite)
			if errors.Is(err, ErrTransferDestinationExists) && job.ConflictPolicy == models.ObjectJobConflictSkip {
				return "skipped", nil
			}
			if errors.Is(err, ErrTransferSourceNotFound) {
				sourceExists, sourceErr := m.s3.ObjectExists(ctx, job.SourceBucket, task.SourceKey)
				destinationExists, destinationErr := m.s3.ObjectExists(ctx, job.DestinationBucket, task.DestinationKey)
				if sourceErr == nil && destinationErr == nil && !sourceExists && destinationExists {
					return "succeeded", nil
				}
			}
			if err != nil {
				return "failed", err
			}
			task.Status = "copied"
			if err := m.store.updateTask(job.ID, task); err != nil {
				return "failed", fmt.Errorf("persist copied move stage: %w", err)
			}
		}
		if err := m.s3.DeleteObject(ctx, job.SourceBucket, task.SourceKey); err != nil {
			return "failed", err
		}
		return "succeeded", nil
	default:
		return "failed", fmt.Errorf("unsupported operation %q", job.Operation)
	}
}

func (m *ObjectJobManager) recalculateJob(job *models.ObjectJob, tasks []objectJobTask) {
	job.Discovered, job.Processed, job.Succeeded, job.Failed, job.Skipped = int64(len(tasks)), 0, 0, 0, 0
	job.BytesTotal, job.BytesProcessed = 0, 0
	for _, task := range tasks {
		job.BytesTotal += task.Size
		switch task.Status {
		case "succeeded":
			job.Succeeded++
		case "failed":
			job.Failed++
		case "skipped":
			job.Skipped++
		default:
			continue
		}
		job.Processed++
		job.BytesProcessed += task.Size
	}
	job.Progress = progress(job.Processed, job.Discovered)
}

func (m *ObjectJobManager) finishJob(job *models.ObjectJob, status, message string) {
	now := time.Now().UTC()
	job.Status, job.Phase, job.Error, job.CurrentKey = status, status, message, ""
	job.FinishedAt = &now
	if status == models.ObjectJobStatusCompleted || status == models.ObjectJobStatusCompletedWithErrors {
		job.Progress = 100
	}
	_ = m.store.saveJob(job)
}

func (m *ObjectJobManager) objectDestination(job *models.ObjectJob, key string) string {
	if job.Operation == models.ObjectJobOperationDelete {
		return ""
	}
	return job.DestinationPrefix + objectBaseName(key)
}

func (m *ObjectJobManager) prefixDestination(job *models.ObjectJob, prefix, key string) string {
	if job.Operation == models.ObjectJobOperationDelete {
		return ""
	}
	root := job.DestinationPrefix + objectBaseName(strings.TrimSuffix(prefix, "/")) + "/"
	return root + strings.TrimPrefix(key, prefix)
}

func normalizeObjectJobRequest(req *models.CreateObjectJobRequest) error {
	req.Operation = strings.ToLower(strings.TrimSpace(req.Operation))
	req.SourceBucket = strings.TrimSpace(req.SourceBucket)
	req.DestinationBucket = strings.TrimSpace(req.DestinationBucket)
	req.DestinationPrefix = normalizeObjectPrefix(req.DestinationPrefix)
	req.ConflictPolicy = strings.ToLower(strings.TrimSpace(req.ConflictPolicy))
	if req.ConflictPolicy == "" {
		req.ConflictPolicy = models.ObjectJobConflictSkip
	}
	if req.Operation != models.ObjectJobOperationCopy && req.Operation != models.ObjectJobOperationMove && req.Operation != models.ObjectJobOperationDelete {
		return fmt.Errorf("operation must be copy, move, or delete")
	}
	if req.SourceBucket == "" {
		return fmt.Errorf("sourceBucket is required")
	}
	if len(req.Objects) == 0 && len(req.Prefixes) == 0 {
		return fmt.Errorf("at least one object or prefix is required")
	}
	req.Objects = uniqueObjectKeys(req.Objects, false)
	req.Prefixes = uniqueObjectKeys(req.Prefixes, true)
	for _, value := range append(append([]string{}, req.Objects...), req.Prefixes...) {
		if value == "" || strings.ContainsRune(value, '\x00') {
			return fmt.Errorf("object keys and prefixes must be non-empty and cannot contain null bytes")
		}
	}
	filteredObjects := req.Objects[:0]
	for _, key := range req.Objects {
		covered := false
		for _, prefix := range req.Prefixes {
			if strings.HasPrefix(key, prefix) {
				covered = true
				break
			}
		}
		if !covered {
			filteredObjects = append(filteredObjects, key)
		}
	}
	req.Objects = filteredObjects
	if req.Operation == models.ObjectJobOperationDelete {
		req.DestinationBucket, req.DestinationPrefix, req.ConflictPolicy = "", "", ""
		return nil
	}
	if req.DestinationBucket == "" {
		return fmt.Errorf("destinationBucket is required for copy and move")
	}
	if req.ConflictPolicy != models.ObjectJobConflictSkip && req.ConflictPolicy != models.ObjectJobConflictOverwrite {
		return fmt.Errorf("conflictPolicy must be skip or overwrite")
	}
	if req.SourceBucket == req.DestinationBucket {
		for _, key := range req.Objects {
			if req.DestinationPrefix+objectBaseName(key) == key {
				return fmt.Errorf("an object cannot be copied or moved onto itself")
			}
		}
		for _, prefix := range req.Prefixes {
			target := req.DestinationPrefix + objectBaseName(strings.TrimSuffix(prefix, "/")) + "/"
			if target == prefix || strings.HasPrefix(target, prefix) {
				return fmt.Errorf("a prefix cannot be copied or moved to itself or one of its descendants")
			}
		}
	}
	return nil
}

func uniqueObjectKeys(values []string, prefix bool) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimLeft(strings.TrimSpace(value), "/")
		if prefix {
			value = normalizeObjectPrefix(value)
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	if prefix {
		filtered := out[:0]
		for i, value := range out {
			covered := false
			for j, other := range out {
				if i != j && strings.HasPrefix(value, other) {
					covered = true
					break
				}
			}
			if !covered {
				filtered = append(filtered, value)
			}
		}
		out = filtered
	}
	return out
}

func normalizeObjectPrefix(value string) string {
	value = strings.TrimLeft(strings.TrimSpace(value), "/")
	if value != "" && !strings.HasSuffix(value, "/") {
		value += "/"
	}
	return value
}

func objectBaseName(value string) string {
	value = strings.TrimSuffix(value, "/")
	if index := strings.LastIndexByte(value, '/'); index >= 0 {
		return value[index+1:]
	}
	return value
}

func progress(processed, total int64) float64 {
	if total <= 0 {
		return 0
	}
	return float64(processed) * 100 / float64(total)
}

func isTerminalJobStatus(status string) bool {
	return status == models.ObjectJobStatusCompleted ||
		status == models.ObjectJobStatusCompletedWithErrors ||
		status == models.ObjectJobStatusFailed ||
		status == models.ObjectJobStatusCancelled
}
