#!/usr/bin/env bash
set -euo pipefail

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
swagger_version="v1.16.6"

mkdir -p "${repo_dir}/openapi"

(
  cd "${repo_dir}/backend"
  go run "github.com/swaggo/swag/cmd/swag@${swagger_version}" init \
    -g main.go \
    --parseDependency \
    --parseInternal
)

cp "${repo_dir}/backend/docs/swagger.yaml" "${repo_dir}/openapi/openapi.yaml"
