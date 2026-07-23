package auth

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

// LocalAdminStore persists the Garage UI administrator separately from the
// runtime configuration. Only a bcrypt hash is written to disk.
type LocalAdminStore struct {
	path string
	mu   sync.Mutex
}

type localAdminRecord struct {
	Username     string `json:"username"`
	PasswordHash string `json:"password_hash"`
}

func NewLocalAdminStore(dataDir string) *LocalAdminStore {
	return &LocalAdminStore{path: filepath.Join(dataDir, "state", "admin-auth.json")}
}

func (s *LocalAdminStore) Configured() (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	_, err := s.readLocked()
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	return err == nil, err
}

func (s *LocalAdminStore) Verify(username, password string) (bool, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	record, err := s.readLocked()
	if errors.Is(err, os.ErrNotExist) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	usernameMatch := subtle.ConstantTimeCompare([]byte(username), []byte(record.Username)) == 1
	passwordMatch := bcrypt.CompareHashAndPassword([]byte(record.PasswordHash), []byte(password)) == nil
	return usernameMatch && passwordMatch, nil
}

func (s *LocalAdminStore) Create(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, err := s.readLocked(); err == nil {
		return fmt.Errorf("administrator is already configured")
	} else if !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return s.writeLocked(username, password)
}

func (s *LocalAdminStore) Update(username, password string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.writeLocked(username, password)
}

func (s *LocalAdminStore) readLocked() (*localAdminRecord, error) {
	data, err := os.ReadFile(s.path)
	if err != nil {
		return nil, err
	}
	var record localAdminRecord
	if err := json.Unmarshal(data, &record); err != nil {
		return nil, fmt.Errorf("read local administrator: %w", err)
	}
	if strings.TrimSpace(record.Username) == "" || strings.TrimSpace(record.PasswordHash) == "" {
		return nil, fmt.Errorf("read local administrator: incomplete record")
	}
	return &record, nil
}

func (s *LocalAdminStore) writeLocked(username, password string) error {
	if err := validateLocalAdminCredentials(username, password); err != nil {
		return err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return fmt.Errorf("hash administrator password: %w", err)
	}
	record, err := json.Marshal(localAdminRecord{Username: username, PasswordHash: string(hash)})
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0700); err != nil {
		return fmt.Errorf("create administrator state directory: %w", err)
	}
	tmp, err := os.CreateTemp(filepath.Dir(s.path), ".admin-auth-*")
	if err != nil {
		return err
	}
	tmpName := tmp.Name()
	defer os.Remove(tmpName)
	if err := tmp.Chmod(0600); err != nil {
		tmp.Close()
		return err
	}
	if _, err := tmp.Write(append(record, '\n')); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if err := os.Rename(tmpName, s.path); err != nil {
		return fmt.Errorf("persist local administrator: %w", err)
	}
	return nil
}

func validateLocalAdminCredentials(username, password string) error {
	if len(strings.TrimSpace(username)) < 3 {
		return fmt.Errorf("username must contain at least 3 characters")
	}
	if len(password) < 12 {
		return fmt.Errorf("password must contain at least 12 characters")
	}
	return nil
}
