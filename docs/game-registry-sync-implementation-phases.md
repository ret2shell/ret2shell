# Ret2Shell Game Registry Sync Implementation Phases

This document splits the registry/upstream sync work into backend and frontend phases.

It is intentionally implementation-oriented and should be read together with:

- `docs/game-registry-sync-design.md`
- `docs/game-registry-sync-checklist.md`

## Phase 1 - Data Model and Mirror Guard Rails

### Backend

- add migrations for:
  - `game.sync_key`
  - `game.sync_token`
  - `challenge.display_order`
  - `game_release`
  - `game_remote_sync`
  - `game_registry_source`
  - `game_sync_job`
- add SeaORM entities and model serialization updates
- initialize the sync workspace under `<bucket.path>/.sync/`
- generate and persist the local `instance-id` file on first boot
- add a reusable backend helper such as `ensure_game_sync_writable(game)`
- apply that helper to all existing game/challenge write paths
- keep the current authoring behavior unchanged for normal local games

Primary backend files:

- `crates/database/src/entities/game.rs`
- `crates/database/src/entities/challenge.rs`
- `crates/database/src/entities/*sync*.rs`
- `crates/migrator/src/migrations/*`
- `crates/server/src/routes/game/*.rs`
- `crates/server/src/routes/game/challenge/*.rs`

### Frontend

- extend `Game` and `Challenge` models with sync-related fields
- add a new `web/src/lib/models/sync.ts`
- replace the current `/admin/sync` placeholder with a simple scaffold page
- add a mirrored-game banner and disabled-state plumbing in existing game admin views
- add i18n keys for mirror state and detach warnings

Primary frontend files:

- `web/src/lib/models/game.ts`
- `web/src/lib/models/challenge.ts`
- `web/src/lib/models/sync.ts`
- `web/src/routes/admin/sync/index.tsx`
- `web/src/routes/games/[game]/index.tsx`
- `web/src/lib/i18n/index.ts`

### Exit Criteria

- migrations apply cleanly on an existing database
- existing non-mirror games still behave exactly as before
- any game marked as `mirror_locked` rejects local mutation requests consistently
- the UI clearly shows that mirrored games are read-only

## Phase 2 - First-Party Publication Metadata

### Backend

- add local game-scoped sync routes under `/api/game/{game}/sync`
- implement sync status and local release listing
- implement `sync_token` rotation endpoint
- implement release manifest builder from repo + DB + media references
- create release refs under `refs/ret2shell/releases/<release_id>`
- implement first-party publication metadata generation
- keep registry commit/push outside the platform boundary

Primary backend files:

- `crates/server/src/routes/game/mod.rs`
- `crates/server/src/routes/game/sync.rs` or equivalent nested module
- `crates/server/src/sync/manifest.rs`
- `crates/server/src/sync/registry.rs`

### Frontend

- add `web/src/lib/api/sync.ts`
- add `/games/[game]/admin/sync/index.tsx`
- add a game admin sidebar entry for sync
- show publication metadata button, release list, and sync token rotation on the game sync page

Primary frontend files:

- `web/src/lib/api/sync.ts`
- `web/src/routes/games/[game]/admin/_blocks/sidebar.tsx`
- `web/src/routes/games/[game]/admin/sync/index.tsx`

### Exit Criteria

- an archived local game can generate a first-party registry publication metadata bundle
- the metadata generation operation stores a local release record and release ref
- the game sync page shows the current release history and sync token controls

## Phase 3 - Remote Serving and Direct Instance-to-Instance Import

### Backend

- add top-level `/api/sync/v1` read-only serving routes
- implement remote discovery endpoints
- implement read-only git upload-pack serving for release refs only
- implement sync-specific media download endpoint by hash
- implement direct discovery against another Ret2Shell instance
- implement import jobs in `direct` mode with resumable stages:
  - `discover`
  - `validate_upstream`
  - `fetch_repo`
  - `fetch_media`
  - `prepare_import`
  - `finalize`
- finalize imports as `mirror_locked`
- implement detach endpoint for remote mirrors

Primary backend files:

- `crates/server/src/routes/mod.rs`
- `crates/server/src/routes/sync/mod.rs`
- `crates/server/src/routes/sync/direct.rs`
- `crates/server/src/routes/sync/job.rs`
- `crates/server/src/routes/sync/serve.rs`
- `crates/server/src/sync/import.rs`
- `crates/server/src/sync/auth.rs`
- `crates/bucket/src/git.rs`

### Frontend

- add direct upstream discovery UI to `/admin/sync`
- add an import wizard that accepts base URL + game/release selection
- add job list and job detail panels with stage progress
- add detach action to `/games/[game]/admin/sync`
- add clearer lock messaging in edit, doc, and challenge-management views

Primary frontend files:

- `web/src/routes/admin/sync/index.tsx`
- `web/src/lib/api/sync.ts`
- `web/src/routes/games/[game]/admin/sync/index.tsx`
- mutation-heavy game admin views under `web/src/routes/games/[game]/admin/`

### Exit Criteria

- one instance can import an archived game directly from another instance
- the imported game becomes a locked mirror with a local release record
- stopping the import midway and retrying resumes from cached git objects and downloaded media
- detaching the mirror unlocks local edits
- releases that contain `internal_managed` challenge images may still be deferred until Phase 6, but the job flow must already detect and report that requirement explicitly

## Phase 4 - Registry-Backed Import and Third-Party Metadata Export

### Backend

- add read-only registry discovery source CRUD and fetch/validate logic
- implement registry catalog parsing from fetched source clones
- add local catalog endpoints for registry browsing
- allow import jobs in `registry` mode
- allow choosing one upstream from registry-discovered candidates
- add third-party upstream advertisement metadata generation
- enforce live third-party validation:
  - reject detached mirrors
  - reject stale release refs
  - reject non-matching release IDs

Primary backend files:

- `crates/server/src/routes/sync/source.rs`
- `crates/server/src/routes/sync/catalog.rs`
- `crates/server/src/sync/registry.rs`
- `crates/server/src/sync/import.rs`

### Frontend

- add registry discovery source management to `/admin/sync`
- add registry browser to `/admin/sync`
- add release detail and upstream selection UI
- add a `generate third-party upstream metadata` option at import completion time or on the game sync page
- add explicit detach confirmation messaging explaining downstream consequences

Primary frontend files:

- `web/src/routes/admin/sync/index.tsx`
- `web/src/lib/api/sync.ts`
- `web/src/lib/models/sync.ts`

### Exit Criteria

- one instance can browse a registry discovery source, choose a release, choose an upstream, and import successfully
- an existing locked mirror can be upgraded in place without creating a second local game
- a locked mirror can generate third-party upstream advertisement metadata
- a detached mirror is rejected as a third-party upstream by live validation

## Phase 5 - Recovery, Conflict Handling, and UX Hardening

### Backend

- improve job retry semantics and error reporting
- support switching to another equivalent upstream during retry
- detect registry conflicts when the same `game_key + release_id` has mismatched release content
- add cleanup/retention for finished jobs and stale staging directories
- add broader integration tests and clippy coverage for the sync pipeline

### Frontend

- show registry conflict warnings instead of silently picking one source
- add retry, resume, and cancel actions to the job UI
- show why an upstream is unavailable or rejected
- show clear mirror provenance and current release details on the game sync page

### Exit Criteria

- operators can understand and recover from common network failures from the UI
- conflicting registry entries are visible and actionable
- job history remains readable after failures and retries

## Phase 6 - Internal-Managed OCI Image Mirroring

This phase is mandatory before claiming full sync support for games that use `internal_managed` challenge images.

### Backend

- extend manifest generation to include `assets.oci_images`
- extend release metadata so each OCI asset records `internal_tag`, `source_repository`, and `digest`
- add a sync-aware docker registry relay/auth flow on top of Ret2Shell's registry proxy
- copy game-scoped OCI images by digest into the local registry namespace for the imported game
- add resumable image-transfer checkpoints to the import job stage model
- reuse the existing cluster registry infrastructure where possible
- rebuild final runtime pull references from `registry.external + local_game_bucket + internal_tag`

### Frontend

- show optional OCI image transfer progress inside job details
- show whether a mirrored release is fully runtime-capable or content-only

### Exit Criteria

- releases with `internal_managed` challenge images can be imported end-to-end, including docker registry assets, without falling back to manual image migration

## Recommended Delivery Order

If the feature is implemented incrementally, use this order:

1. Phase 1
2. Phase 2
3. Phase 3
4. Phase 4
5. Phase 5
6. Phase 6 only if needed

The key milestone is the end of Phase 3.

At that point the platform already supports:

- locked remote mirrors
- direct instance-to-instance import
- resumable repo/media sync
- safe detach behavior

Registry-backed discovery and third-party upstream metadata export can then be added on top without reopening the core import model.
