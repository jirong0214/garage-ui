package models

// CreateBucketRequest represents a request to create a new bucket
type CreateBucketRequest struct {
	Name   string `json:"name" validate:"required"`
	Region string `json:"region,omitempty"`
}

// GrantBucketPermissionRequest represents a request to grant permissions on a bucket
type GrantBucketPermissionRequest struct {
	AccessKeyID string              `json:"accessKeyId" validate:"required"`
	Permissions BucketKeyPermission `json:"permissions" validate:"required"`
}

// CreateUserRequest represents a request to create a new user/key
type CreateUserRequest struct {
	Name string `json:"name,omitempty"`
}

// UpdateUserRequest represents a request to update user permissions
type UpdateUserRequest struct {
	Status     *string `json:"status,omitempty"`     // "active" or "inactive"
	Expiration *string `json:"expiration,omitempty"` // ISO 8601 date string
}

// UpdateBucketWebsiteRequest represents a request to update bucket website configuration
type UpdateBucketWebsiteRequest struct {
	Enabled       bool   `json:"enabled"`
	IndexDocument string `json:"indexDocument,omitempty"`
	ErrorDocument string `json:"errorDocument,omitempty"`
}

// UpdateBucketQuotasRequest represents a request to update bucket quota settings.
// A nil field means "clear this quota" (unlimited). A non-nil field must be > 0;
// Garage rejects 0.
type UpdateBucketQuotasRequest struct {
	MaxSize    *int64 `json:"maxSize,omitempty"`
	MaxObjects *int64 `json:"maxObjects,omitempty"`
}

// ObjectTransferRequest describes the destination of a copy or move. The
// source bucket is the route parameter so authorization can scope it without
// trusting a duplicate value in the body.
type ObjectTransferRequest struct {
	SourceKey         string `json:"sourceKey"`
	DestinationBucket string `json:"destinationBucket"`
	DestinationKey    string `json:"destinationKey"`
	Overwrite         bool   `json:"overwrite"`
}
