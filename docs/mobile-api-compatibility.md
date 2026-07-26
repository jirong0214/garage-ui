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

Mobile opts into a revocable device session by sending `device_name` and
`device_platform` to `POST /auth/login`. The response contains:

- a 15-minute JWT access token;
- a 30-day opaque refresh token;
- both expiry timestamps; and
- the device session identifier.

The refresh token is rotated by `POST /auth/refresh`. Reuse of any already
rotated token revokes the entire device session. The server persists only a
SHA-256 hash of each refresh secret, while Mobile stores the complete credential
bundle only in the platform secure store. Access JWTs issued for device sessions
carry a session identifier, so `POST /auth/logout`,
`DELETE /auth/sessions/{id}`, and `DELETE /auth/sessions` invalidate affected
access tokens immediately. `GET /auth/sessions` lists the caller's device
sessions.

Existing Web clients remain compatible: omitting both device fields returns the
historical access-only JWT response and does not create a device session.
Capabilities advertise the additive `refreshTokens` and `deviceSessions`
features. Garage admin tokens and S3 credentials are never mobile API inputs.

## Deferred: paginated object search

Prefix browsing supports `continuation_token`, but the current `search`
parameter performs a bounded recursive scan and does not return a continuation
token. When the server reports a truncated search result, Mobile must label the
result as potentially incomplete and must not pretend that another page can be
loaded.

A future search contract needs an opaque cursor bound to the server, bucket,
prefix, search term, and stable ordering. It is intentionally deferred rather
than approximated on the client, because a client-generated offset would cause
duplicates or omissions while objects change.

## Additive changes

The canonical object routes and `apiVersion` fields are additive. Existing
routes and response fields remain intact. Deployments older than contract 1.x
will not expose this metadata. Release clients must report them as
incompatible rather than silently assuming compatibility. Explicit LAN Debug
builds may continue for diagnostics after showing an unknown-contract warning;
this exception must not ship in Release.
