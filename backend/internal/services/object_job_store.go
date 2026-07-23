package services

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"time"

	"Noooste/garage-ui/internal/models"

	bolt "go.etcd.io/bbolt"
)

var ErrObjectJobNotFound = errors.New("object job not found")

var (
	objectJobsBucket  = []byte("object_jobs")
	objectTasksBucket = []byte("object_job_tasks")
)

type objectJobTask struct {
	SourceKey      string `json:"sourceKey"`
	DestinationKey string `json:"destinationKey,omitempty"`
	Size           int64  `json:"size"`
	Status         string `json:"status"`
	Error          string `json:"error,omitempty"`
}

type objectJobStore struct {
	db *bolt.DB
}

func openObjectJobStore(path string) (*objectJobStore, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o750); err != nil {
		return nil, fmt.Errorf("create object job directory: %w", err)
	}
	db, err := bolt.Open(path, 0o600, &bolt.Options{Timeout: 2 * time.Second})
	if err != nil {
		return nil, fmt.Errorf("open object job database: %w", err)
	}
	store := &objectJobStore{db: db}
	if err := db.Update(func(tx *bolt.Tx) error {
		if _, err := tx.CreateBucketIfNotExists(objectJobsBucket); err != nil {
			return err
		}
		_, err := tx.CreateBucketIfNotExists(objectTasksBucket)
		return err
	}); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("initialize object job database: %w", err)
	}
	return store, nil
}

func (s *objectJobStore) Close() error { return s.db.Close() }

func (s *objectJobStore) saveJob(job *models.ObjectJob) error {
	data, err := json.Marshal(job)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		return tx.Bucket(objectJobsBucket).Put([]byte(job.ID), data)
	})
}

func (s *objectJobStore) createJob(job *models.ObjectJob) (bool, error) {
	data, err := json.Marshal(job)
	if err != nil {
		return false, err
	}
	created := false
	err = s.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket(objectJobsBucket)
		if bucket.Get([]byte(job.ID)) != nil {
			return nil
		}
		created = true
		return bucket.Put([]byte(job.ID), data)
	})
	return created, err
}

func (s *objectJobStore) getJob(id string) (*models.ObjectJob, error) {
	var job models.ObjectJob
	err := s.db.View(func(tx *bolt.Tx) error {
		data := tx.Bucket(objectJobsBucket).Get([]byte(id))
		if data == nil {
			return ErrObjectJobNotFound
		}
		return json.Unmarshal(data, &job)
	})
	if err != nil {
		return nil, err
	}
	return &job, nil
}

func (s *objectJobStore) listJobs(owner string, limit int) ([]models.ObjectJob, error) {
	jobs := make([]models.ObjectJob, 0)
	err := s.db.View(func(tx *bolt.Tx) error {
		return tx.Bucket(objectJobsBucket).ForEach(func(_, value []byte) error {
			var job models.ObjectJob
			if err := json.Unmarshal(value, &job); err != nil {
				return err
			}
			if owner == "" || job.Owner == owner {
				jobs = append(jobs, job)
			}
			return nil
		})
	})
	sort.Slice(jobs, func(i, j int) bool { return jobs[i].CreatedAt.After(jobs[j].CreatedAt) })
	if limit > 0 && len(jobs) > limit {
		jobs = jobs[:limit]
	}
	return jobs, err
}

func (s *objectJobStore) putTasks(jobID string, tasks []objectJobTask) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		root := tx.Bucket(objectTasksBucket)
		bucket, err := root.CreateBucketIfNotExists([]byte(jobID))
		if err != nil {
			return err
		}
		for _, task := range tasks {
			data, err := json.Marshal(task)
			if err != nil {
				return err
			}
			if err := bucket.Put([]byte(task.SourceKey), data); err != nil {
				return err
			}
		}
		return nil
	})
}

func (s *objectJobStore) listTasks(jobID string) ([]objectJobTask, error) {
	tasks := make([]objectJobTask, 0)
	err := s.db.View(func(tx *bolt.Tx) error {
		bucket := tx.Bucket(objectTasksBucket).Bucket([]byte(jobID))
		if bucket == nil {
			return nil
		}
		return bucket.ForEach(func(_, value []byte) error {
			var task objectJobTask
			if err := json.Unmarshal(value, &task); err != nil {
				return err
			}
			tasks = append(tasks, task)
			return nil
		})
	})
	return tasks, err
}

func (s *objectJobStore) updateTask(jobID string, task objectJobTask) error {
	data, err := json.Marshal(task)
	if err != nil {
		return err
	}
	return s.db.Update(func(tx *bolt.Tx) error {
		bucket := tx.Bucket(objectTasksBucket).Bucket([]byte(jobID))
		if bucket == nil {
			return ErrObjectJobNotFound
		}
		return bucket.Put([]byte(task.SourceKey), data)
	})
}

func (s *objectJobStore) failures(jobID string, offset, limit int) ([]models.ObjectJobFailure, int, error) {
	tasks, err := s.listTasks(jobID)
	if err != nil {
		return nil, 0, err
	}
	all := make([]models.ObjectJobFailure, 0)
	for _, task := range tasks {
		if task.Status == "failed" {
			all = append(all, models.ObjectJobFailure{
				SourceKey: task.SourceKey, DestinationKey: task.DestinationKey, Error: task.Error,
			})
		}
	}
	sort.Slice(all, func(i, j int) bool { return all[i].SourceKey < all[j].SourceKey })
	total := len(all)
	if offset > total {
		offset = total
	}
	end := offset + limit
	if end > total {
		end = total
	}
	return all[offset:end], total, nil
}

func (s *objectJobStore) deleteExpired(before time.Time) error {
	return s.db.Update(func(tx *bolt.Tx) error {
		jobs := tx.Bucket(objectJobsBucket)
		tasks := tx.Bucket(objectTasksBucket)
		var ids [][]byte
		err := jobs.ForEach(func(key, value []byte) error {
			var job models.ObjectJob
			if err := json.Unmarshal(value, &job); err != nil {
				return err
			}
			if job.FinishedAt != nil && job.FinishedAt.Before(before) {
				ids = append(ids, append([]byte(nil), key...))
			}
			return nil
		})
		if err != nil {
			return err
		}
		for _, id := range ids {
			if err := jobs.Delete(id); err != nil {
				return err
			}
			if err := tasks.DeleteBucket(id); err != nil && !errors.Is(err, bolt.ErrBucketNotFound) {
				return err
			}
		}
		return nil
	})
}
