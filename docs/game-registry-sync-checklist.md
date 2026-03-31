# Ret2Shell Game Registry Sync Checklist

This document turns `docs/game-registry-sync-design.md` into a concrete implementation checklist.

It locks down naming, API boundaries, database changes, storage layout, and the minimum acceptance criteria for the first implementation pass.

## 1. Naming Decisions

Use the following names consistently.

| Scope | Name | Concrete form |
| --- | --- | --- |
| Registry and upstream protocol | `game_key` | external release identity |
| Local database column | `sync_key` | `game.sync_key` |
| Mapping rule | `game_key = sync_key` | same value, different naming context |
| Dedicated sync credential | `sync_token` | `game.sync_token` |
| Released snapshot identity | `release_id` | equal to `snapshot_commit` in v1 |
| Published git ref | release ref | `refs/ret2shell/releases/<release_id>` |
| Remote mirror state | mirror state | `mirror_locked` or `detached` |

Rules:

- Use `bucket` only for the local filesystem repo directory.
- Use `game_key` only in registry files and remote sync protocol payloads.
- Use `sync_key` only in local database/entity/API payloads.
- The first publish of a local game sets `sync_key = bucket` if `sync_key` is still empty.

## 2. Storage and Filesystem Decisions

V1 does not add a new operator-visible config section.

Instead, derive the sync workspace from the existing bucket root.

Recommended paths:

```text
<bucket.path>/.sync/
  instance-id
  sources/
    <source-id>/
  mirrors/
    <instance-id>/<game_key>.git/
  jobs/
    <job-id>/
      repo/
      state.json
  media-part/
    <hash>.part
```

Rules:

- `instance-id` is a persistent local file containing one generated UUID.
- Removing a registry source deletes only `sources/<source-id>/` and the matching DB row.
- Job workspaces must be safe to delete after terminal completion and retention expiry.
- Release refs live inside the existing game repo, not under `.sync/`.

## 3. Database Checklist

### 3.1 `game` table

Add:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `sync_key` | text | yes | stable cross-instance identity |
| `sync_token` | text | yes | dedicated read-only sync token |

Constraints and rules:

- partial unique index on `sync_key` where `sync_key is not null`
- backfill `sync_key = bucket` for existing non-training games with a bucket
- generate `sync_token` for existing non-training games during migration backfill
- generate `sync_token` on future game creation when `host_type = Game`
- `sync_key` becomes immutable after first publish or after remote import

### 3.2 `challenge` table

Add:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `display_order` | integer | no | stable ordering for imported releases |

Migration rule:

- backfill `display_order` by `row_number() over (partition by game_id order by id)`

### 3.3 `game_release` table

Create a new immutable local release record table.

Recommended columns:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint PK | no | local row ID |
| `game_id` | bigint FK | no | local game |
| `game_key` | text | no | copied from `game.sync_key` |
| `release_id` | text | no | published release ID |
| `snapshot_commit` | text | no | git commit ID |
| `manifest_sha256` | text | no | SHA-256 of canonical manifest text |
| `manifest_body` | text | no | canonical TOML manifest |
| `origin_role` | integer | no | `first_party` or `mirror` |
| `first_party_instance_id` | text | no | authoritative source |
| `first_party_base_url` | text | no | authoritative source URL |
| `published_at` | timestamptz | no | release publish time |
| `created_at` | timestamptz | no | local record time |

Indexes and constraints:

- unique `(game_id, release_id)`
- unique `(game_key, release_id)`
- index on `(game_key, published_at desc)`

### 3.4 `game_remote_sync` table

Create one row only for remotely synchronized games.

Recommended columns:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `game_id` | bigint PK/FK | no | owning game |
| `state` | integer | no | `mirror_locked` or `detached` |
| `current_release_id` | text | no | mirrored release |
| `snapshot_commit` | text | no | mirrored snapshot commit |
| `manifest_sha256` | text | no | canonical manifest hash |
| `manifest_body` | text | no | canonical manifest TOML |
| `first_party_instance_id` | text | no | authoritative source |
| `first_party_base_url` | text | no | authoritative source URL |
| `selected_upstream_instance_id` | text | no | chosen download source |
| `selected_upstream_base_url` | text | no | chosen download source URL |
| `last_synced_at` | timestamptz | no | last successful mirror sync |
| `detached_at` | timestamptz | yes | detach time |
| `detached_by` | bigint FK user | yes | local operator |

Rules:

- `game_id` is the primary key; at most one remote sync state per game
- only `mirror_locked` games may serve as third-party upstreams
- `detached` games remain auditable but must never serve as third-party upstreams

### 3.5 `game_registry_source` table

Create one row per configured read-only registry discovery source.

These rows are used only for browsing/import. They are not publication targets.

Recommended columns:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint PK | no | local source ID |
| `name` | text | no | display name |
| `git_url` | text | no | remote git URL |
| `branch` | text | no | default `main` |
| `enabled` | boolean | no | discovery toggle |
| `priority` | integer | no | display/order priority |
| `last_fetched_at` | timestamptz | yes | last successful fetch |
| `last_error` | text | yes | last fetch or parse error |
| `created_at` | timestamptz | no | local creation time |
| `updated_at` | timestamptz | no | local update time |

Indexes and constraints:

- unique `(git_url, branch)`
- unique `name`

Credential policy for v1:

- do not add a dedicated secret store yet
- allow anonymous/public sources first
- allow authenticated/private discovery sources only through already-available git credentials in the runtime environment

### 3.6 `game_sync_job` table

Create one row per import job.

Publication metadata generation is synchronous in v1 and does not create long-running publish jobs.

Recommended columns:

| Column | Type | Null | Notes |
| --- | --- | --- | --- |
| `id` | bigint PK | no | local job ID |
| `mode` | integer | no | `registry` or `direct` |
| `status` | integer | no | `pending`, `running`, `paused`, `failed`, `completed`, `cancelled` |
| `stage` | text | no | current stage label |
| `game_id` | bigint FK | yes | local target game if it exists |
| `game_key` | text | yes | target release game key |
| `release_id` | text | yes | target release |
| `registry_source_id` | bigint FK | yes | selected discovery source |
| `upstream_instance_id` | text | yes | chosen source instance |
| `upstream_base_url` | text | yes | chosen source URL |
| `request_body` | jsonb | no | original job request |
| `checkpoint` | jsonb | no | resumable stage state |
| `error_message` | text | yes | last failure |
| `created_by` | bigint FK user | no | initiating operator |
| `created_at` | timestamptz | no | create time |
| `updated_at` | timestamptz | no | update time |
| `finished_at` | timestamptz | yes | terminal completion time |

Rules:

- use `checkpoint` instead of creating a second job-item table in v1
- enforce one active import job per `game_key` in service logic
- publication metadata generation does not use this table in v1

## 4. Entity and Model Checklist

Backend entities to update or add:

- `crates/database/src/entities/game.rs`
- `crates/database/src/entities/challenge.rs`
- `crates/database/src/entities/game_release.rs`
- `crates/database/src/entities/game_remote_sync.rs`
- `crates/database/src/entities/game_registry_source.rs`
- `crates/database/src/entities/game_sync_job.rs`

Frontend models to update or add:

- `web/src/lib/models/game.ts`
- `web/src/lib/models/challenge.ts`
- `web/src/lib/models/sync.ts`

Frontend model fields to expose:

- on `Game`: `sync_key`, `sync_token` (admin only), `remote_sync_state`, `remote_release_id`, `remote_first_party_base_url`
- on `Challenge`: `display_order`
- new sync models: registry discovery source, release summary, upstream summary, sync job, sync stage status, publication metadata bundle

## 5. Local Admin API Checklist

These are authenticated local APIs used by the Ret2Shell web UI.

### 5.1 Registry discovery source management

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync/source` | list registry discovery sources |
| `POST` | `/api/sync/source` | create source |
| `PATCH` | `/api/sync/source/{source}` | update source |
| `DELETE` | `/api/sync/source/{source}` | remove source |
| `POST` | `/api/sync/source/{source}/fetch` | fetch and validate source |

Request fields for `POST` and `PATCH`:

- `name`
- `git_url`
- `branch`
- `enabled`
- `priority`

### 5.2 Registry catalog browsing

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync/catalog/games?source_id=<id>` | list discovered games |
| `GET` | `/api/sync/catalog/games/{game_key}?source_id=<id>` | list releases for one game |
| `GET` | `/api/sync/catalog/games/{game_key}/releases/{release_id}?source_id=<id>` | get release + upstream candidates |

### 5.3 Direct upstream discovery

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sync/direct/discover` | inspect one remote instance without registry |

Request body:

```json
{
  "base_url": "https://ctf.example.edu",
  "game_key": "example_game_661f5423"
}
```

### 5.4 Import jobs

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sync/import` | start import job |
| `GET` | `/api/sync/job` | list sync jobs |
| `GET` | `/api/sync/job/{job}` | get job detail |
| `POST` | `/api/sync/job/{job}/resume` | resume paused/failed job |
| `POST` | `/api/sync/job/{job}/cancel` | cancel active job |

Import request body:

```json
{
  "mode": "registry",
  "registry_source_id": 1,
  "game_key": "example_game_661f5423",
  "release_id": "8e0d3f0d1c7f2db6f4e1b2f5d0cc9c65a76a4d8a",
  "upstream_instance_id": "2f9e6b4f-dc7e-4ef6-8c8f-78a1d08c81a1",
  "upstream_base_url": "https://ctf.example.edu"
}
```

### 5.5 Game-scoped sync actions

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/game/{game}/sync` | get local sync status |
| `GET` | `/api/game/{game}/sync/releases` | list local release records |
| `POST` | `/api/game/{game}/sync/publish` | generate first-party registry publication metadata |
| `POST` | `/api/game/{game}/sync/sync-token` | rotate sync token |
| `POST` | `/api/game/{game}/sync/advertise` | generate third-party upstream advertisement metadata |
| `POST` | `/api/game/{game}/sync/detach` | detach locked mirror |

`POST /api/game/{game}/sync/publish` body:

```json
{}
```

`POST /api/game/{game}/sync/advertise` body:

```json
{}
```

`POST /api/game/{game}/sync/detach` body:

```json
{
  "reason": "Need to customize the imported archive locally"
}
```

`POST /api/game/{game}/sync/publish` and `POST /api/game/{game}/sync/advertise` return relative registry file paths plus canonical file contents.

They do **not** commit or push to any registry repo.

## 6. Remote Serving API Checklist

These are the cross-instance APIs exposed to other Ret2Shell platforms.

All remote-serving routes must live under `/api/sync/v1`.

### 6.1 Discovery

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync/v1/info` | instance identity and protocol info |
| `GET` | `/api/sync/v1/games` | list available published games |
| `GET` | `/api/sync/v1/games/{game_key}` | list available releases |
| `GET` | `/api/sync/v1/games/{game_key}/releases/{release_id}` | get release metadata |

### 6.2 Git snapshot transport

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync/v1/games/{game_key}/releases/{release_id}/repo/info/refs?service=git-upload-pack` | advertise release ref |
| `POST` | `/api/sync/v1/games/{game_key}/releases/{release_id}/repo/git-upload-pack` | stream git pack data |

Rules:

- no remote write API in the sync namespace
- only advertise `refs/ret2shell/releases/<release_id>`
- do not expose authoring branches or working refs

### 6.3 Media transport

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync/v1/media/{hash}` | download one media blob by hash |

### 6.4 Internal-managed registry relay

If a release contains any `assets.oci_images` entry, the upstream sync API must also provide a sync-aware path for docker registry copy.

Recommended routes:

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/sync/v1/games/{game_key}/releases/{release_id}/registry/catalog` | list OCI assets included in the release |
| `ANY` | `/api/sync/v1/games/{game_key}/releases/{release_id}/registry/v2/{*path}` | sync-aware docker registry relay |

Rules:

- the relay validates `sync_token` instead of ordinary web login state
- the relay only allows manifest and blob digests reachable from the release-declared `assets.oci_images` roots
- the relay maps those requests to the upstream Ret2Shell registry proxy/backend
- the importer pushes into its own local registry namespace using local trusted credentials

### 6.5 Auth behavior

| `access_policy.sync` | Discovery | Repo/media download |
| --- | --- | --- |
| `0` | public | public |
| `1` | require `Authorization: Bearer <sync_token>` | require `Authorization: Bearer <sync_token>` |
| `2` | reject | reject |

For detached mirrors:

- discovery may still show historical metadata locally if desired
- live release fetch for third-party serving must return `409 Conflict`

## 7. Authorization Checklist

Use these permission rules.

| Action | Permission |
| --- | --- |
| manage registry discovery sources | `Permission::DevOps` |
| fetch registry discovery source | `Permission::DevOps` |
| create import job | `Permission::Host` or `Permission::DevOps` |
| resume/cancel import job | job creator, `Permission::Host`, or `Permission::DevOps` |
| generate local game release publication metadata | existing game admin guard or `Permission::Host` |
| generate third-party upstream advertisement metadata | existing game admin guard or `Permission::Host` |
| rotate `sync_token` | existing game admin guard or `Permission::Host` |
| detach mirror | existing game admin guard or `Permission::Host` |
| remote release serving | `sync_token` or public sync policy |

## 8. Backend Code Touch Checklist

### 8.1 New server modules

Add a new top-level route namespace:

- `crates/server/src/routes/sync/mod.rs`
- `crates/server/src/routes/sync/source.rs`
- `crates/server/src/routes/sync/catalog.rs`
- `crates/server/src/routes/sync/direct.rs`
- `crates/server/src/routes/sync/job.rs`
- `crates/server/src/routes/sync/serve.rs`

Add reusable sync services under a non-route module, for example:

- `crates/server/src/sync/manifest.rs`
- `crates/server/src/sync/registry.rs`
- `crates/server/src/sync/job.rs`
- `crates/server/src/sync/import.rs`
- `crates/server/src/sync/path.rs`
- `crates/server/src/sync/auth.rs`
- `crates/server/src/sync/registry_proxy.rs`

### 8.2 Existing backend files that must be updated

- `crates/server/src/routes/mod.rs` - mount `/sync`
- `crates/server/src/routes/game/mod.rs` - add `/sync` nested routes
- `crates/server/src/routes/game/core.rs` - block mutation for locked mirrors where needed
- `crates/server/src/routes/game/repo.rs` - reject git writes for locked mirrors
- `crates/server/src/routes/game/challenge/resource.rs` - reject challenge mutation for locked mirrors
- `crates/server/src/routes/game/challenge/hint.rs` - reject hint mutation for locked mirrors
- `crates/server/src/routes/game/challenge/attachment.rs` - reject attachment mutation for locked mirrors
- `crates/server/src/routes/game/challenge/checker.rs` - reject checker/env mutation for locked mirrors
- `crates/server/src/routes/cluster/registry.rs` - share or adapt registry proxy logic for sync-aware OCI relay
- `crates/server/src/routes/media/mod.rs` - optionally add internal helper for sync media download checks
- `crates/bucket/src/git.rs` - support safe upload-pack serving for release refs only

## 9. Frontend Code Touch Checklist

### 9.1 New API layer

Add:

- `web/src/lib/api/sync.ts`

This module should cover:

- registry discovery source CRUD
- registry catalog browsing
- direct discovery
- import job lifecycle
- game-scoped publication metadata/advertise/detach/status APIs

### 9.2 New frontend models

Add:

- `web/src/lib/models/sync.ts`

Suggested exported types:

- `SyncRegistrySource`
- `SyncReleaseSummary`
- `SyncReleaseDetail`
- `SyncUpstreamSummary`
- `SyncJob`
- `SyncJobStage`
- `RemoteSyncState`

### 9.3 New pages and UI placements

Use these locations:

- reuse `web/src/routes/admin/sync/index.tsx` for platform-wide sync operations
- add `web/src/routes/games/[game]/admin/sync/index.tsx` for game-scoped metadata export/detach controls
- add a sidebar entry in `web/src/routes/games/[game]/admin/_blocks/sidebar.tsx`

Recommended page split:

- `/admin/sync`:
  - discovery sources
  - registry browser
  - direct sync form
  - job monitor
- `/games/[game]/admin/sync`:
  - local release list
  - publication metadata button
  - rotate sync token button
  - mirror status
  - detach action

### 9.4 Existing frontend pages that must show mirror lock state

Add read-only banners or disabled controls to at least:

- `web/src/routes/games/[game]/index.tsx`
- `web/src/routes/games/[game]/_blocks/doc-form.tsx`
- challenge edit/create views under `web/src/lib/blocks/challenge/`
- game admin edit pages under `web/src/routes/games/[game]/admin/`

### 9.5 Translation checklist

Update `web/src/lib/i18n/index.ts` with keys for:

- registry discovery source management
- release publication metadata status
- upstream selection
- import job stages
- mirror locked banner
- detach confirmation and failure messages

## 10. Validation Checklist

Before allowing publication metadata generation:

- game is archived
- game is not a training game
- game has a bucket
- game is not a locked remote mirror
- `access_policy.sync != 2`
- local repo is clean

Before allowing import finalization:

- release manifest matches fetched release metadata
- checked-out `HEAD` equals `snapshot_commit`
- all required media hashes are locally available
- all required OCI assets are locally available when any challenge image is `internal_managed`
- no other active import job owns the same `game_key`

Before allowing third-party advertisement metadata generation:

- local game has `game_remote_sync.state = mirror_locked`
- local release ref for `release_id` exists
- local release ref points to the mirrored `snapshot_commit`

Before allowing in-place mirror upgrade:

- an existing local game with the same `sync_key` must already be a `mirror_locked` remote mirror
- the staged repo swap must be recoverable if finalization fails midway

Before allowing detach:

- target game currently has `game_remote_sync.state = mirror_locked`

## 11. Test Checklist

Backend tests to add:

- migration backfill for `sync_key`, `sync_token`, and `display_order`
- manifest build/parse round-trip
- first-party and third-party publication metadata bundle generation
- registry discovery source parser and conflict detection
- remote serving auth matrix for `access_policy.sync`
- import job resume from failed `fetch_repo` and failed `fetch_media`
- sync-aware registry relay auth matrix for releases with `assets.oci_images`
- import job resume from failed internal-managed OCI image mirroring
- in-place mirror upgrade keeps the same local game ID and refreshes release/challenge data atomically
- locked mirror mutation rejection across game, challenge, hint, attachment, and repo write routes
- third-party upstream rejection after detach

Frontend tests to add where practical:

- discovery source list rendering and form validation
- import wizard request serialization
- job stage rendering
- publication metadata bundle rendering
- lock banner visibility and disabled controls for mirrored games

## 12. Minimum Acceptance Criteria

The checklist is complete for the first usable version when all of the following are true:

1. A local archived game can generate a first-party registry publication metadata bundle without direct registry git access.
2. Another instance can import that release directly from the first instance without using the registry.
3. Another instance can also import the same release from the registry after selecting an upstream.
4. Imported games are marked `mirror_locked` and block all local mutation paths.
5. A detached mirror becomes locally editable and is rejected as a third-party upstream.
6. Import jobs can be interrupted and resumed without re-downloading already-fetched git objects or media hashes.
7. If the release contains `internal_managed` challenge images, the matching OCI images are mirrored through the sync-aware registry flow and the imported game resolves them from the local registry namespace.
