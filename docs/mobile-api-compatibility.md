# Mobile API compatibility

Garage UI Mobile negotiates the API contract using `apiVersion` from
`GET /health` and `GET /api/v1/capabilities`. Contract `1.x` is the initial
mobile-compatible API. The Garage Admin API version remains a separate
`garageApiVersion` capability.

## Exact object keys

Canonical single-object routes pass the S3 key in the `key` query parameter:

```text
GET    /api/v1/buckets/{bucket}/object?key={key}
HEAD   /api/v1/buckets/{bucket}/object?key={key}
DELETE /api/v1/buckets/{bucket}/object?key={key}
GET    /api/v1/buckets/{bucket}/object/metadata?key={key}
GET    /api/v1/buckets/{bucket}/object/thumbnail?key={key}
GET    /api/v1/buckets/{bucket}/object/presign?key={key}
GET    /api/v1/buckets/{bucket}/object/preview-url?key={key}
```

Clients must use a standard URL query encoder exactly once. Object keys are
opaque UTF-8 data: leading slashes, whitespace, `+`, `#`, `?`, `%`, Unicode,
embedded slashes, and trailing slashes must not be trimmed or rewritten.

The older `/objects/*` routes remain available for existing Web clients. They
are compatibility routes and cannot unambiguously address an object whose key
ends in `/metadata`, `/thumbnail`, `/presign`, or `/preview-url`. New generated
clients use only the canonical query-key routes.

## Authentication

Mobile uses `POST /auth/login` and sends the returned JWT as
`Authorization: Bearer <token>`. The current JWT has no refresh-token or
per-device-session support; those capabilities remain required before mobile
beta. Garage admin tokens and S3 credentials are never mobile API inputs.

## Additive changes

The canonical object routes and `apiVersion` fields are additive. Existing
routes and response fields remain intact. Deployments older than contract 1.x
will not expose this metadata. Release clients must report them as
incompatible rather than silently assuming compatibility. Explicit LAN Debug
builds may continue for diagnostics after showing an unknown-contract warning;
this exception must not ship in Release.
