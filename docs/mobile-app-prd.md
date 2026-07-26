# Garage UI Mobile App PRD

| Field | Value |
| --- | --- |
| Product | Garage UI Mobile |
| Platforms | iOS and Android |
| Technology direction | React Native with Expo Development Build |
| Document status | Draft for implementation |
| Release scope | Phase 1: browse, preview, upload, download, share, and basic object management |
| Backend dependency | Garage UI API |

## 1. Executive summary

Garage UI Mobile is a native mobile client for an existing Garage UI
deployment. Its first release focuses on the workflows people naturally perform
from a phone:

- browse buckets, folders, and objects;
- preview photos, videos, audio, PDFs, and text;
- upload content from Photos, Camera, Files, and other apps;
- download content for offline access or export it to another app;
- copy public URLs or create temporary signed URLs;
- rename, copy, move, and delete objects;
- inspect and recover transfer failures.

The app communicates only with Garage UI API. It never receives the Garage
admin token or a Garage S3 secret key. Garage UI API remains the policy and
credential boundary between mobile users and Garage.

Phase 1 deliberately excludes cluster administration, access-key management,
bucket creation and deletion, and server-side configuration. Those operations
are high impact, infrequent, and better suited to the Web UI.

## 2. Background

Garage UI is now split into two deployable services:

- `garage-ui-api`, which connects to Garage Admin API and S3 API and enforces
  authentication and authorization;
- `garage-ui-web`, which is a browser client of that API.

This makes a mobile client practical without duplicating Garage integration
logic. Existing backend capabilities already cover most object workflows:

- bucket and object listing;
- object metadata and content;
- thumbnails and temporary preview URLs;
- public URL metadata and signed download URLs;
- single and multiple uploads;
- single-object copy and move;
- durable recursive and multi-object copy, move, and delete jobs.

Mobile introduces requirements that a browser does not fully solve:

- credentials must use the platform Keychain or Keystore;
- transfers must survive navigation, network changes, and process suspension;
- users expect Photos, Camera, Files, share sheet, and offline file integration;
- touch interaction, small screens, safe-area handling, and accessibility need
  dedicated UI rather than a responsive copy of the Web UI.

## 3. Product goals

### 3.1 Phase 1 goals

1. Let a user connect securely to an initialized Garage UI server and remain
   signed in on a trusted device.
2. Make common object-browsing workflows comfortable on a phone.
3. Provide reliable, observable upload and download queues.
4. Use native file, media, clipboard, and sharing capabilities.
5. Preserve the same authorization decisions as the Web UI.
6. Avoid exposing Garage administrator or S3 credentials to the device.
7. Establish a shared, versioned API contract that can support both Web and
   Mobile clients.

### 3.2 Success criteria

Phase 1 is successful when:

- a new user can configure a server and reach a bucket in under two minutes;
- an authenticated user can upload a photo and obtain its public or signed URL
  without using the Web UI;
- interrupted transfers are visible and can be retried without losing the
  user's selected source or destination;
- an object can be previewed, downloaded, exported, renamed, moved, copied, or
  deleted using touch-friendly interactions;
- the app never stores a Garage admin token, S3 access key, or S3 secret key;
- API permission denials are represented as actionable UI states rather than
  generic failures.

### 3.3 Non-goals for Phase 1

- Garage cluster layout, node repair, snapshots, or worker management;
- S3 access-key creation, secret display, rotation, or deletion;
- bucket creation, deletion, aliases, quotas, website configuration, or
  permissions;
- initial Garage UI bootstrap using `admin_token`;
- OIDC login;
- automatic camera-roll backup;
- cross-server object transfer;
- editing office documents, PDFs, images, or videos;
- public-link access analytics;
- real-time collaborative file management;
- end-to-end encryption implemented by the mobile app.

## 4. Product principles

### 4.1 File first

The first screen after login is the user's storage, not a mobile version of the
cluster dashboard.

### 4.2 Native where it matters

Use system pickers, share sheets, secure storage, media surfaces, and background
transfer APIs. Do not wrap the existing Web UI in a WebView.

### 4.3 Explicit destructive actions

Copying and downloading may be immediate. Moving and deleting require clear
destination or impact confirmation. Recursive folder deletion must display that
all objects under the prefix will be deleted.

### 4.4 Recoverable network behavior

Network failures must produce retryable transfer records. The app must not
present a failed upload as complete or silently discard an unfinished task.

### 4.5 Least credential exposure

The device receives only Garage UI session credentials and short-lived
object-specific URLs. Garage credentials remain in the backend.

## 5. Target users and core scenarios

### 5.1 Primary user

A self-hosting user who owns or administers a Garage deployment and wants to
access personal files, screenshots, photos, videos, and documents from a phone.

Typical scenarios:

- upload a screenshot and copy its public URL;
- inspect photos stored in a bucket;
- download a document and open it in another app;
- move several files into a folder;
- delete outdated files;
- share a private object using a one-hour signed URL.

### 5.2 Secondary user

An OIDC team member with access to a limited set of buckets or prefixes.
Phase 1 does not implement OIDC login, but all navigation and actions must
already respect capabilities returned by the backend so OIDC can be added
without redesigning the product.

## 6. Assumptions and dependencies

### 6.1 Deployment assumptions

- Garage UI has already been initialized in the Web UI.
- The phone can reach Garage UI API through HTTPS.
- The public S3 presign endpoint, when configured, is also reachable by the
  phone.
- Bucket public URLs are configured by the server administrator where public
  sharing is expected.
- Production builds reject plain HTTP server URLs. Development builds may allow
  explicitly configured LAN HTTP endpoints.

### 6.2 Backend assumptions

- Authorization remains enforced by Garage UI API.
- Object folders remain S3 key prefixes rather than real directories.
- The backend may use one Garage admin token internally, but it never returns
  that token to Mobile.
- Durable recursive operations continue to run on a single Garage UI API job
  runner unless the backend architecture changes.

## 7. Information architecture

Phase 1 uses three bottom-level destinations:

```text
Files
├── Buckets
│   └── Folder browser
│       └── Object preview/details
└── Selection actions

Transfers
├── Uploading
├── Downloading
├── Completed
└── Failed

Settings
├── Server
├── Account
├── Storage and cache
├── Appearance
└── About
```

The bottom navigation remains visible on top-level screens. Object preview,
picker flows, destination selection, and transfer details use pushed or modal
screens.

## 8. Functional requirements

### 8.1 Server setup

#### Requirements

- The first launch presents an "Add server" flow.
- The user enters a Garage UI base URL, for example
  `https://garage.example.com`.
- The app normalizes trailing slashes but does not rewrite scheme, host, port,
  or path without confirmation.
- "Test connection" calls a public health or server-info endpoint and reports:
  - reachable or unreachable;
  - Garage UI API version;
  - supported API contract version;
  - available authentication methods.
- TLS, DNS, timeout, incompatible-version, and unexpected-server errors have
  distinct messages.
- The data model supports multiple server profiles, but Phase 1 UI may expose
  one active profile at a time.
- Removing a server profile deletes its session credentials and local cache but
  never deletes remote data.

#### Acceptance criteria

- Invalid URLs cannot proceed.
- A URL that serves unrelated HTML is not accepted as Garage UI.
- Production builds warn and reject plain HTTP.
- A reachable but incompatible API explains the supported version range.

### 8.2 Authentication and session

#### Phase 1 authentication

- Username and password login is required.
- Garage `admin_token` bootstrap is not available in Mobile.
- OIDC is deferred, but the login page can display an unsupported-method
  explanation if the server is OIDC-only.
- Access and refresh credentials are stored in platform secure storage.
- App logout revokes the current device refresh session when online and always
  clears local credentials.
- Session expiry attempts one transparent refresh before showing login.
- Repeated refresh failure returns the user to login without deleting offline
  downloads.

#### Backend work required

The current 24-hour JWT is sufficient for development but not the target mobile
session model. Add:

- short-lived access tokens;
- opaque refresh tokens stored as hashes by the backend;
- per-device session records;
- refresh, logout, list-device, and revoke-device endpoints;
- optional session revocation after password changes.

Suggested endpoints:

```text
POST   /auth/login
POST   /auth/refresh
POST   /auth/logout
GET    /auth/sessions
DELETE /auth/sessions/{id}
```

#### Acceptance criteria

- Tokens never appear in application logs or analytics.
- Access tokens survive process restart through secure storage.
- Revoking a device prevents its next refresh.
- A stolen expired access token cannot be refreshed without the corresponding
  refresh token.

### 8.3 Bucket list

#### Content

- Bucket name and bucket icon.
- Object count and total bytes when available.
- Public URL availability indicator.
- Last successful refresh time when showing cached data.

#### Interaction

- Pull to refresh.
- Search by bucket name.
- Tap a bucket to open its root.
- Empty, loading, offline-cached, forbidden, and error states.
- Buckets without `bucket.list` permission are not shown.

#### Phase 1 exclusions

No create, delete, quota, alias, permission, or website configuration actions.

### 8.4 Object and folder browser

#### Content

- Folder prefix or object type icon.
- Thumbnail for supported images.
- Object name, MIME type, size, and modified time.
- Two-line wrapping for long names and MIME types.
- Current path breadcrumb or compact path title.

#### Interaction

- Tap a folder to navigate into its prefix.
- Tap an object to open preview/details.
- Pull to refresh.
- Infinite or cursor-based pagination.
- Sort by name, modified time, size, and type.
- Remember sort mode per server and bucket.
- Multi-select by long press, followed by tap selection.
- Preserve scroll position when returning from object preview.
- Do not lazy-load already visible page thumbnails only after scrolling; begin
  requests for the current page when the list is rendered.

#### Folder semantics

- A folder is a key prefix ending in `/`.
- Directory-marker objects are not shown as regular zero-byte files.
- Recursive actions explicitly state that every object under the prefix is in
  scope.

#### Cached and offline behavior

- Previously loaded object metadata and thumbnails may be displayed offline
  with an offline banner.
- Remote mutations are disabled while offline in Phase 1.
- Downloaded files remain available from Transfers even when the server is
  offline.

### 8.5 Search

Phase 1 search is scoped to the current bucket and prefix.

- Search input filters the loaded page immediately.
- If the backend supports prefix or server-side search, submit after a short
  debounce and clearly show the active scope.
- Search results retain their full object path.
- Selecting a result can open the object or reveal its containing folder.
- Global full-text indexing is out of scope.

### 8.6 Object preview and details

#### Common preview shell

- Full-screen, edge-to-edge preview.
- Back, share, download, and overflow actions.
- File name shown without obscuring content.
- Tap once to show or hide controls for media.
- Metadata is available in a bottom sheet.
- Previous and next navigation is limited to the currently loaded list context.

#### Supported previews

| Type | Phase 1 behavior |
| --- | --- |
| JPEG, PNG, GIF, WebP, AVIF, HEIC/HEIF | Native image preview, zoom, pan, save |
| MP4 and commonly supported video | Native streaming player |
| Common audio formats | Native audio player with progress |
| PDF | Native or platform-backed PDF viewer |
| UTF-8 text, JSON, XML, source code | Read-only text preview with size limit |
| Unknown or unsupported | Type icon, metadata, download, and share actions |

The backend's short-lived preview URL is used for authenticated media surfaces
that cannot attach an Authorization header.

#### Image behavior

- Double-tap and pinch zoom.
- Zoomed images pan independently without zooming the application window.
- Controls attach to the preview surface and respect safe areas.
- Background uses the application's normal surface color, not forced black.

#### Text preview limits

- Only fetch an initial bounded range or reject files above the configured
  preview threshold.
- Never decode an unbounded object fully into JavaScript memory.

#### Metadata

- Full key.
- MIME type.
- Size.
- ETag when available.
- Last modified in local time.
- Optional UTC, relative time, and Unix timestamp details.
- Bucket and public URL availability.

### 8.7 Upload

#### Upload sources

- System Photos picker.
- Camera capture.
- System Files or document picker.
- Share-to-Garage extension from another application, deferred to Phase 1.1 if
  it risks the initial release.

#### Upload flow

1. User starts Upload from the current folder.
2. User selects one or more source files.
3. App displays destination bucket and prefix.
4. User can edit object names before upload.
5. App checks duplicate policy.
6. Tasks enter the persistent transfer queue.
7. Progress is visible globally and per task.
8. Successful upload offers Open, Copy public URL, or Share signed URL.

#### Conflict policy

- Ask when the destination exists.
- Apply choice to this item or all conflicts in the batch.
- Choices:
  - skip;
  - replace;
  - keep both using a generated suffix.

The backend must remain the source of truth for conflict detection. A local
preflight check is advisory because another client may write concurrently.

#### Transfer states

```text
waiting
preparing
uploading
paused
retrying
completed
failed
cancelled
```

#### Reliability requirements

- Queue metadata persists across process restart.
- Cancellation is explicit.
- Network loss moves a task to waiting or retrying rather than failed
  immediately.
- Retry uses bounded exponential backoff.
- The app distinguishes retrying the whole file from resuming uploaded parts.
- Upload progress uses bytes sent, not only item count.
- The user can remove a completed or failed history record without deleting
  the remote object.

#### Backend upload design

The current Garage UI multipart proxy remains a development fallback. The
production mobile path should use short-lived, permission-checked upload
sessions:

```text
POST   /api/v1/buckets/{bucket}/uploads
POST   /api/v1/buckets/{bucket}/uploads/{id}/parts
POST   /api/v1/buckets/{bucket}/uploads/{id}/complete
DELETE /api/v1/buckets/{bucket}/uploads/{id}
```

For a small object, the backend can return one signed PUT URL. For a large
object, it returns a multipart upload ID and signed part URLs. The backend:

- checks `object.write` permission;
- validates bucket, key, declared size, MIME type, and configured limits;
- never returns an S3 access or secret key;
- limits URL lifetime;
- completes or aborts multipart uploads;
- returns final object metadata and public URL availability.

The upload host must be reachable from the phone and must match the host used
when the URL was signed.

### 8.8 Download and offline files

#### Download flow

- Download starts from preview, details, object menu, or selection actions.
- The app requests a short-lived signed GET URL.
- The native transfer layer downloads into an application-controlled directory.
- The transfer remains visible after leaving the source screen.
- Completed files can be:
  - opened;
  - shared;
  - saved to Photos where applicable;
  - exported to Files or Android document storage;
  - removed from the device without deleting the remote object.

#### Reliability

- Download queue persists.
- Downloads support retry.
- Resume is used when both server and platform transfer APIs support it.
- Insufficient-storage errors include required and available space when
  available.
- A signed URL expiring during a retry causes the app to request a new URL.

#### Storage management

- Settings shows downloaded-file and thumbnail-cache usage separately.
- "Clear cache" does not delete user-marked offline files.
- "Remove all downloads" requires confirmation.

### 8.9 Public URL, signed URL, and sharing

#### Public URL

- Show only when the backend returns a configured public URL for the bucket.
- Copying uses the exact backend-derived URL.
- The app does not infer public accessibility solely from a domain template.
- Public URL availability does not grant write permission.

#### Signed URL

- User selects an expiry such as 15 minutes, 1 hour, 1 day, or 7 days.
- The app displays expiry time before sharing.
- The generated URL is copied or passed to the system share sheet.
- The signed URL host cannot be replaced after signing.

#### Native file sharing

Sharing a downloaded file uses the system share sheet. Sharing a remote object
without downloading uses a public or signed URL.

### 8.10 Rename, copy, move, and delete

#### Rename

- Rename is presented for one object or one folder prefix.
- Object rename is implemented as move.
- Folder rename uses a durable recursive move job.
- Invalid names and moves into descendants are rejected before submission when
  possible and authoritatively validated by the backend.

#### Copy and move

- Destination is selected interactively by bucket and folder.
- Multi-selection can include explicit objects and folder prefixes.
- Conflict policy is selected before job creation.
- Operations use the existing durable object-job API.
- Job progress remains available in Transfers after leaving the screen.

#### Delete

- One object: confirmation names the object.
- Multiple objects: confirmation shows item count.
- Folder: confirmation states that all objects under the prefix are included.
- Destructive confirmation never defaults to the dangerous action.
- Recursive and multi-object deletion use a durable backend job.

### 8.11 Transfers

The Transfers tab combines two kinds of work:

- local upload and download tasks;
- server-side copy, move, and delete jobs.

Each row shows operation, object or selection summary, progress, state, and
latest error. Detail view shows:

- source and destination;
- byte or object counters;
- creation and completion time;
- retry, cancel, or dismiss actions as applicable;
- per-object server job failures.

The app polls active server jobs with backoff. Push notifications and WebSocket
job updates are deferred.

### 8.12 Settings and account

#### Server

- Active server name and URL.
- API and Garage version when available.
- Connection test.
- Sign out.
- Remove server profile.

#### Account

- Current username.
- Change local username and password when supported.
- Device-session list after the refresh-session API is implemented.
- Revoke another device.

#### Storage and cache

- Thumbnail cache size.
- Downloaded-file size.
- Clear cache.
- Remove downloads.
- Optional Wi-Fi-only upload and download switches.

#### Appearance

- System, light, or dark theme.

#### About

- App version and build number.
- Garage UI API version.
- Open-source licenses.
- Documentation and issue tracker links.

## 9. Permissions and capability-driven UI

Mobile must fetch `/api/v1/capabilities` after login and after changing server.
Actions are hidden or disabled according to resolved permissions.

| Mobile action | Required permission |
| --- | --- |
| List buckets | `bucket.list` |
| Open bucket metadata | `bucket.read` |
| List folder | `object.list` |
| Preview, download, signed URL | `object.read` |
| Upload and create folder | `object.write` |
| Delete | `object.delete` |
| Copy source | `object.list`, `object.read` |
| Copy destination | `object.read`, `object.write` |
| Move source | `object.list`, `object.read`, `object.delete` |
| Move destination | `object.read`, `object.write` |

The backend remains authoritative. A hidden button is a usability feature, not
a security boundary.

## 10. UX states and error handling

Every data screen must implement:

- initial loading;
- pull-to-refresh loading;
- empty;
- cached and offline;
- permission denied;
- authentication expired;
- server incompatible;
- timeout;
- generic server error with request ID where available.

Errors use plain language and preserve technical detail in an expandable area.
Transfer errors must identify whether retry is safe.

Examples:

- "The server cannot be reached" instead of "Network Error."
- "Your session expired. Sign in again" for an unrecoverable refresh failure.
- "This account cannot upload to pics" for `object.write` denial.
- "The signed download address expired; requesting a new one" during automatic
  recovery.

## 11. Accessibility and localization

### 11.1 Accessibility

- All icon-only controls have accessible names.
- Touch targets are at least 44 by 44 points or platform equivalent.
- Text respects system font scaling without overlapping controls.
- Selection and transfer progress are announced to screen readers.
- Color is never the only representation of state.
- Reduced-motion settings disable nonessential transitions.
- Preview controls remain usable in portrait and landscape.

### 11.2 Localization

Phase 1 ships Simplified Chinese and English. Strings must be externalized from
the beginning. Dates, times, file sizes, decimal separators, and plural forms
use the device locale.

## 12. Non-functional requirements

### 12.1 Performance

- First interactive screen within 2.5 seconds on a representative mid-range
  device after cached authentication.
- Scrolling remains responsive with at least 1,000 objects across paginated
  results.
- Thumbnails use bounded concurrency and cancellation for off-screen work.
- Large files are streamed and never loaded fully into JavaScript memory.
- Preview text and JSON have explicit byte limits.

### 12.2 Reliability

- Transfer and session state survives process restart.
- Retrying a create-job request uses an `Idempotency-Key`.
- Duplicate upload completion and job creation requests are safe.
- A process crash does not mark unfinished work complete.

### 12.3 Security

- HTTPS is mandatory in production.
- Access and refresh credentials use platform secure storage.
- Garage admin token and S3 keys never reach the app.
- Sensitive values are redacted from logs and crash reports.
- Signed and preview URLs are treated as credentials and are not persisted
  longer than necessary.
- Certificate pinning is not enabled by default because this is a self-hosted
  product with user-managed certificate rotation.
- Destructive operations require server authorization and UI confirmation.
- Mobile application backups must not contain session tokens.

### 12.4 Privacy

- No analytics or crash reporting is enabled without an explicit project
  decision and privacy disclosure.
- The app does not scan the photo library beyond items selected by the user.
- Local metadata and thumbnails are deleted when a server profile is removed.

## 13. Technical architecture

### 13.1 Recommended stack

| Area | Choice | Rationale |
| --- | --- | --- |
| Framework | React Native, current stable release | Reuses React and TypeScript expertise while rendering native UI |
| Build workflow | Expo Development Build and prebuild | Expo tooling with access to custom native modules |
| Language | TypeScript, strict mode | Shared API types and safer refactoring |
| Navigation | Expo Router | File-based native navigation and deep-link support |
| Server state | TanStack Query | Request lifecycle, pagination, invalidation, and caching |
| Local UI state | Zustand | Small, explicit stores consistent with the Web project |
| Forms | React Hook Form and Zod | Validation and typed forms |
| Secure credentials | Expo SecureStore | Keychain and Keystore-backed small secret storage |
| Metadata database | Expo SQLite | Persistent server profiles, transfer queue, and cache index |
| Images | Expo Image or equivalent native image cache | Memory and disk-aware image rendering |
| Media | Expo Video and Expo Audio or native equivalents | Platform playback controls |
| Files | Expo FileSystem plus native transfer adapter | File access with a path to background transfer |
| Testing | Vitest/Jest, React Native Testing Library, Maestro | Unit, component, and device-level flows |

Expo Go is not the Phase 1 runtime target. Reliable background transfers,
share extensions, and platform configuration require a Development Build or
release build.

### 13.2 Native transfer abstraction

Define a platform-independent TypeScript interface:

```ts
interface TransferEngine {
  enqueueUpload(input: UploadInput): Promise<TransferRecord>;
  enqueueDownload(input: DownloadInput): Promise<TransferRecord>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  cancel(id: string): Promise<void>;
  observe(listener: TransferListener): () => void;
}
```

Implementations:

- iOS: background `URLSession` upload and download tasks;
- Android: WorkManager and platform HTTP transfer implementation;
- development fallback: foreground Expo FileSystem transfers.

The transfer database is authoritative for app UI state; native task
identifiers are persisted with each record.

### 13.3 Shared API contract

The repository should use one generated OpenAPI contract:

```text
Garage UI API annotations and schemas
              ↓
        openapi.yaml
          ↙       ↘
Web TypeScript   Mobile TypeScript
client           client
```

The generated transport and schemas can be shared in a workspace package. Web
and Mobile keep separate TanStack Query hooks and UI adapters.

Before Mobile implementation:

- correct route annotations that differ from runtime routes;
- document auth bootstrap, account, capabilities, thumbnails, previews, and
  object jobs;
- replace anonymous request and response schemas with named models;
- define object-key encoding behavior;
- validate error envelopes and all non-2xx statuses;
- add CI drift detection for generated clients.

### 13.4 Suggested repository layout

```text
garage-ui/
├── backend/
├── frontend/
├── mobile/
│   ├── app/
│   ├── src/
│   │   ├── components/
│   │   ├── features/
│   │   ├── storage/
│   │   ├── transfers/
│   │   └── platform/
│   ├── ios/
│   └── android/
├── packages/
│   ├── api-client/
│   ├── api-types/
│   └── domain/
└── openapi/
    └── openapi.yaml
```

The shared packages contain no React DOM, React Native, Radix, Tailwind, or
platform storage dependencies.

### 13.5 Local data model

Suggested entities:

```text
ServerProfile
- id
- displayName
- baseUrl
- apiVersion
- active
- lastConnectedAt

TransferRecord
- id
- serverId
- direction
- operation
- bucket
- objectKey
- localUri
- size
- transferredBytes
- state
- retryCount
- nativeTaskId
- remoteUploadId
- errorCode
- createdAt
- updatedAt

DownloadedFile
- id
- serverId
- bucket
- objectKey
- localUri
- size
- etag
- downloadedAt

CachedObjectPage
- serverId
- bucket
- prefix
- cursor
- response
- cachedAt
```

Access and refresh tokens are not stored in SQLite.

## 14. Backend and API work

### 14.1 Required before mobile beta

1. Stabilize and validate OpenAPI.
2. Add API contract/version metadata.
3. Implement refresh and per-device sessions.
4. Add permission-checked direct upload sessions.
5. Ensure signed download URLs can be renewed.
6. Confirm cursor pagination and sorting contracts.
7. Add cache validators for thumbnails and object metadata where practical.
8. Return stable machine-readable error codes.
9. Add request IDs to error responses or response headers.
10. Add contract tests for encoded object keys.

### 14.2 Existing APIs to reuse

- auth configuration, login, logout, and account endpoints;
- `/api/v1/capabilities`;
- bucket list and details;
- object list, metadata, thumbnail, content, preview URL, and signed URL;
- single-object copy and move;
- durable object jobs and failure details.

### 14.3 Object-key compatibility suite

All clients and routes must pass tests for:

```text
image.jpg
folder/image.jpg
Screenshot 01.png
中文文件名.jpg
a#b?.txt
percent%name.txt
emoji-name.png
directory-marker/
```

Tests cover listing, metadata, preview, download, rename, copy, move, delete,
public URL, and signed URL generation.

## 15. Testing strategy

### 15.1 Unit tests

- URL normalization.
- Object-key encoding.
- MIME classification.
- file-size and date formatting.
- capability-to-action mapping.
- transfer state reducer.
- retry policy.
- conflict-name generation.

### 15.2 Component tests

- login and server setup.
- bucket and object empty/error states.
- selection toolbar.
- upload conflict dialog.
- preview actions.
- transfer progress and failure recovery.
- permission-driven hidden and disabled states.

### 15.3 API contract tests

- generated client compiles after backend changes;
- documented endpoints match registered routes;
- request and response payloads validate against OpenAPI;
- auth refresh and revocation;
- signed URL expiry and renewal;
- multipart upload create, complete, abort, and retry;
- object-key compatibility suite.

### 15.4 End-to-end tests

Run against an isolated Garage and Garage UI stack:

1. add server and log in;
2. open a bucket and folder;
3. upload one photo and one document;
4. preview both;
5. download and share the document;
6. copy public URL and signed URL;
7. rename and move the photo;
8. multi-select and delete;
9. interrupt and retry an upload;
10. expire a signed URL and renew it;
11. revoke the mobile session and verify logout.

### 15.5 Device matrix

At minimum:

- current and previous major iOS versions;
- current and two recent Android API levels;
- one iPhone with a notch or Dynamic Island;
- one small iPhone;
- one mid-range Android device;
- one Android device with aggressive background-process management;
- Wi-Fi, mobile network, offline, and network-switch scenarios.

## 16. Observability

Phase 1 logging is local and privacy-preserving:

- app version, platform, and API version;
- request ID and stable error code;
- transfer state transitions without URLs, tokens, or object contents;
- native transfer task identifier;
- crash breadcrumbs with secrets redacted.

If remote crash reporting is adopted, it requires a separate privacy and data
retention decision.

Backend metrics should distinguish Web and Mobile through a non-sensitive
client header such as:

```text
X-Garage-UI-Client: mobile/1.0.0 ios
```

The header is informational and never used for authorization.

## 17. Delivery plan

Estimates assume one developer primarily on Mobile with backend support. They
are sequencing estimates, not calendar commitments.

### Milestone 0: API foundation, 1 week

- audit and correct OpenAPI;
- generate shared TypeScript client;
- define API compatibility policy;
- add object-key contract tests;
- scaffold `mobile/` and workspace packages.

Exit criteria: generated client can authenticate and list buckets against a
development deployment.

### Milestone 1: Application shell and authentication, 1 week

- Expo Development Build setup;
- navigation, themes, localization, and error boundary;
- server profile and connection test;
- secure credential storage;
- login, refresh, logout, and capability loading.

Exit criteria: a user can restart the app and securely resume a valid session.

### Milestone 2: Browse and preview, 1.5 to 2 weeks

- bucket list;
- paginated folder browser;
- thumbnails and metadata cache;
- image, video, audio, PDF, text, and fallback previews;
- scroll restoration, sorting, search, and offline cached states.

Exit criteria: supported objects are browsable and previewable on representative
iOS and Android devices.

### Milestone 3: Download and sharing, 1 week

- persistent download queue;
- signed URL renewal;
- native open, export, save, clipboard, and share sheet;
- storage and cache management.

Exit criteria: downloads survive navigation and recover from temporary network
loss.

### Milestone 4: Upload, 2 to 3 weeks

- Photos, Camera, and Files selection;
- upload session backend;
- single PUT and multipart uploads;
- native background transfer adapters;
- conflict policies, progress, cancellation, retry, and completion actions.

Exit criteria: large uploads recover from network changes and app suspension
without exposing Garage credentials.

### Milestone 5: Object operations and transfer center, 1 to 1.5 weeks

- multi-select;
- destination picker;
- rename, copy, move, and delete;
- server object-job progress, cancellation, and failures;
- unified Transfers UI.

Exit criteria: recursive and multi-object jobs remain observable after leaving
the source screen or restarting the app.

### Milestone 6: Hardening and beta, 1 to 2 weeks

- accessibility;
- localization review;
- security review;
- performance profiling;
- device and weak-network testing;
- TestFlight and Android internal-distribution builds;
- release notes and support documentation.

Expected Phase 1 duration: approximately 8 to 11 weeks with the reliable
background transfer scope included.

## 18. Release gates

Phase 1 cannot ship until:

- no Garage admin token or S3 key can be found in app storage or logs;
- all production traffic requires HTTPS;
- refresh-token revocation is verified;
- upload and download queues recover after process restart;
- destructive operations pass permission and confirmation tests;
- object-key compatibility suite passes on backend, Web, and Mobile clients;
- accessibility checks pass for primary flows;
- both language bundles are complete;
- iOS and Android beta builds pass the end-to-end scenario;
- backup and restore behavior for secure credentials is documented and tested.

## 19. Risks and mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Background transfer behavior differs by platform | Failed or stalled large transfers | Native transfer abstraction, real-device testing, persistent queue |
| Presigned host is not reachable from mobile | Upload/download cannot start | Connection diagnostics and deployment documentation |
| Signed URL expires during retry | Transfer fails after waiting | Request a fresh URL before retry |
| Object-key encoding differs between clients | Wrong object or 404 | Shared encoder and compatibility suite |
| Existing OpenAPI does not match runtime routes | Generated client is incorrect | Route audit and CI contract drift checks |
| Phone storage is exhausted | Downloads fail or corrupt | Preflight storage check, atomic completion, clear error |
| Self-signed or LAN HTTP deployments | Mobile OS blocks connection | HTTPS-first guidance; explicit development-only override |
| Large media consumes JavaScript memory | Crash or poor performance | Native streaming and bounded previews |
| Mobile exposes dangerous administration | High-impact accidental changes | Exclude cluster, key, and bucket administration from Phase 1 |
| Server upgrades break old clients | App becomes unusable | API version negotiation and compatibility window |

## 20. Deferred roadmap

Candidates after Phase 1:

- OIDC with system browser and PKCE;
- share-to-Garage extension;
- automatic camera-roll backup;
- favorite and recent objects;
- multiple active server profiles;
- push notification on long job completion;
- read-only cluster health;
- bucket creation for appropriately authorized users;
- configurable upload rules and photo naming templates;
- offline folder pinning;
- resumable cross-device transfer history;
- tablet and foldable-specific layouts.

## 21. Open decisions

These decisions should be resolved before Milestone 4:

1. Maximum object size for single signed PUT before switching to multipart.
2. Multipart part size and maximum concurrent parts on Wi-Fi and mobile data.
3. Whether Phase 1 includes share-to-Garage extensions.
4. Whether downloaded files are included in operating-system device backups.
5. Minimum supported iOS and Android versions.
6. Whether multiple server profiles are exposed in Phase 1 or only modeled.
7. Whether background transfer uses project-owned native modules or a vetted
   third-party package behind the same abstraction.
8. Whether anonymous crash reporting is offered as opt-in.

## 22. Reference documentation

- [React Native](https://reactnative.dev/)
- [React Native Turbo Native Modules](https://reactnative.dev/docs/turbo-native-modules-introduction)
- [Expo SecureStore](https://docs.expo.dev/versions/latest/sdk/securestore/)
- [Expo FileSystem](https://docs.expo.dev/versions/latest/sdk/filesystem/)
- [Expo DocumentPicker](https://docs.expo.dev/versions/latest/sdk/document-picker/)
- [Expo ImagePicker](https://docs.expo.dev/versions/latest/sdk/imagepicker/)
- [Apple background URLSession](https://developer.apple.com/documentation/foundation/urlsessionconfiguration/background%28withidentifier%3A%29)
- [Garage UI object jobs](object-jobs.md)
- [Garage UI access control](access-control.md)
