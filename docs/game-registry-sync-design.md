# Ret2Shell Game Registry and Upstream Sync Design

Related planning docs:

- `docs/game-registry-sync-checklist.md`
- `docs/game-registry-sync-implementation-phases.md`

## 1. Goals

This document proposes a registry-driven, git-based game synchronization design for Ret2Shell.

The design must satisfy the following product goals:

1. Define a `ret2shell game registry` format distributed by ordinary git remotes, with `https://github.com/ret2shell/game-registry` as the default discovery source.
2. Allow operators to add and remove read-only registry discovery sources for catalog browsing.
3. Allow a finished and archived game to generate the canonical registry metadata needed for external publication, without committing or pushing to a registry repo directly.
4. Allow other Ret2Shell instances to sync one archived game from a registry entry or directly from another instance.
5. Allow the operator to choose which upstream instance to download from.
6. Do not reuse the existing game event token for synchronization; add a dedicated sync token.
7. Mark remotely synchronized games as immutable mirrors and block local modifications until the mirror is explicitly detached.
8. Make the sync flow interruptible and resumable, and reuse git transport wherever possible.
9. Keep cross-instance identifiers stable without sharing auto-increment database IDs.

## 2. Non-goals

This phase does **not** attempt to synchronize the following data classes:

- players and player accounts
- teams and team membership
- scoreboards and rank results
- submissions, solves, audits, notifications, chats, pods, runtime instances
- local admin identities, local institute IDs, local article IDs, or any other instance-local numeric IDs
- external registry publication destinations, git credentials, commit/push workflow, or registry-side revocation automation

The design is focused on synchronizing archived game content and related assets, not on replaying an old competition database.

## 3. Existing Constraints

The current codebase already gives several important constraints:

- A game is backed by a local git repository under its `bucket`.
- Game docs and challenge resources are already written into the game bucket repo.
- Media is stored outside the git repo in a separate hash-addressed media store.
- Challenge runtime images may be marked as `internal_managed` and store a portable `internal_tag`, so the actual pullable image reference is reconstructed from the local Ret2Shell registry and the local game namespace at runtime.
- The current game `token` is used for event/device connections and must not be reused for upstream sync.
- The current git push sync path is intended for local authoring and does not fully model remote snapshot mirroring.
- Current challenge ordering depends too much on local IDs or local creation order, which is not portable.
- The existing `/game/{id}/registry` route name is already used for the cluster image registry, so the new feature should avoid reusing the plain word `registry` as an API/module name.

The new design therefore treats the game repo as the portable content source, treats media as a second portable artifact class, and never depends on upstream numeric IDs.

## 4. Terminology

### 4.1 Game key

`game_key` is the stable cross-instance identity of a released game.

- For a locally created first-party game, the initial `game_key` is derived from the original game `bucket`.
- `game_key` is immutable after the first publication.
- A local instance may use a different local `bucket` path if the original bucket name is already occupied.
- Registry lookup, release discovery, and direct sync all use `game_key`, never local numeric `game.id`.

This resolves the difference between:

- `bucket`: local filesystem repository name
- `game_key`: global synchronization identity

### 4.2 Release

A `release` is one immutable archived snapshot of a game.

- `release_id` is equal to the published snapshot git commit ID in v1.
- Each release points to one exact repo snapshot and one exact portable metadata manifest.

### 4.3 First-party upstream

The `first-party upstream` is the original Ret2Shell instance that hosted and published the game.

It is the authoritative origin of the release.

### 4.4 Third-party upstream

A `third-party upstream` is another Ret2Shell instance that has synchronized the same release and is still serving it as an unchanged locked mirror.

### 4.5 Sync token

`sync_token` is a dedicated read-only capability token used only for release discovery, git snapshot download, and media download.

- It is distinct from the current game `token`.
- It must never grant write access.
- It must never expose player, team, or submission data.

### 4.6 Mirror states

- `local`: ordinary local game, not a remote mirror
- `mirror_locked`: synchronized from remote and locally immutable
- `detached`: originally synchronized from remote, but locally unlocked and therefore no longer eligible as a third-party upstream

## 5. High-Level Design

The design has four cooperating parts:

1. An externally managed git-backed `game registry` repo that stores release metadata and upstream advertisements.
2. A per-instance `release serving` layer that exposes archived releases by `game_key` and `release_id`.
3. A resumable `sync job` pipeline that downloads a repo snapshot, media objects, and portable metadata before a final transactional import.
4. An `immutability model` that keeps synchronized mirrors byte-identical until they are explicitly detached.

The most important rule is:

> Git is the source of truth for the released repo snapshot, media hashes are the source of truth for portable media blobs, and local numeric database IDs are always recreated on the target instance.

## 6. Registry Discovery Sources and Publication Boundary

Each Ret2Shell instance may support a local list of read-only registry discovery sources.

In the rest of this document, a `registry source` means a discovery input used for browsing and import, not a publication target.

Suggested source fields:

| Field | Meaning |
| --- | --- |
| `id` | local source ID |
| `name` | display name |
| `git_url` | remote git URL |
| `branch` | branch to track, default `main` |
| `enabled` | whether the source participates in discovery |
| `priority` | source ordering for conflict display |
| `last_fetched_at` | last successful fetch time |
| `last_error` | last fetch or parse error |

Default source:

- `name = ret2shell-official`
- `git_url = https://github.com/ret2shell/game-registry`
- `branch = main`

Adding a source means:

1. persist the source locally
2. clone or fetch the source into a local registry cache directory
3. validate the registry format version

Removing a source only removes local configuration and local cache; it does not modify the remote git repo.

For publication, Ret2Shell should not store or choose a target registry repo, branch, or credential.

Instead, the platform should return deterministic relative file paths and canonical file contents for the metadata that needs to be published, and leave the actual git commit/push workflow to external operators or CI automation.

## 7. Registry Repository Format

### 7.1 Why the registry must be append-only

The registry will be updated by multiple operators and multiple instances.

To keep git merges simple, the registry should avoid shared mutable index files and instead use append-only per-release and per-upstream files.

That gives us:

- fewer merge conflicts
- straightforward `git pull --rebase` retry behavior
- stable history for auditing
- safe publication retries after network failures

### 7.2 Repository tree

Recommended layout:

```text
registry.toml
games/
  <game_key>/
    releases/
      <release_id>.toml
    upstreams/
      <instance_id>/
        <published_at>.toml
```

Where:

- `releases/<release_id>.toml` is immutable release metadata
- `upstreams/<instance_id>/<published_at>.toml` is an append-only upstream advertisement record

### 7.3 Top-level registry metadata

`registry.toml` should contain at least:

```toml
spec_version = 1
kind = "ret2shell-game-registry"
```

### 7.4 Release manifest format

Each release file is immutable and contains only release facts, not mutable access credentials.

Example:

```toml
spec_version = 1
kind = "release"
game_key = "example_game_661f5423"
release_id = "8e0d3f0d1c7f2db6f4e1b2f5d0cc9c65a76a4d8a"
snapshot_commit = "8e0d3f0d1c7f2db6f4e1b2f5d0cc9c65a76a4d8a"
published_at = 1713634000
first_party_instance_id = "2f9e6b4f-dc7e-4ef6-8c8f-78a1d08c81a1"

[game]
name = "Example Game"
brief = "Archived challenge set"
host_type = "game"
start_at = 1713630263
end_at = 1713630266
register_at = 1713630259
archive_at = 1713630268
team_size = 1
weight = 3
sync_policy = 0
can_register_after_started = true
cover_kind = "media_hash"
cover_value = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
logo_kind = "media_hash"
logo_value = "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789"
show_answer_after_archive = false
show_hints_after_archive = false

[[challenges]]
key = "web_661f54e1"
order = 1
hidden = false
score = 500
release_at = 1713630263
archive_at = 1713630268

[[challenges]]
key = "pwn_661f5502"
order = 2
hidden = false
score = 371

[assets]
media_hashes = [
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
  "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
]

[[assets.oci_images]]
internal_managed = true
internal_tag = "moectf2024-sample-web:latest"
source_repository = "example_game_661f5423/moectf2024-sample-web"
digest = "sha256:1111111111111111111111111111111111111111111111111111111111111111"
```

Notes:

- `release_id` equals `snapshot_commit` in v1.
- `order` is required because local challenge IDs are not portable.
- Cover/logo are typed so the manifest can distinguish `media_hash` from `repo_path` or `external_url`.
- `media_hashes` lists all hash-addressed media blobs referenced by synchronized content.
- `assets.oci_images` is required whenever any challenge image in the release is `internal_managed = true`.
- `internal_tag` is the portable challenge-image tag stored without the registry host and without the per-instance local game namespace.
- `source_repository` tells the importer which upstream registry repository must be copied from when reconstructing the image in another instance.

### 7.5 Upstream advertisement format

Upstream advertisements are append-only records.

Example first-party advertisement:

```toml
spec_version = 1
kind = "upstream"
status = "active"
game_key = "example_game_661f5423"
release_id = "8e0d3f0d1c7f2db6f4e1b2f5d0cc9c65a76a4d8a"
instance_id = "2f9e6b4f-dc7e-4ef6-8c8f-78a1d08c81a1"
role = "first_party"
published_at = 1713634012
base_url = "https://ctf.example.edu"
auth_mode = "sync_token"
sync_token = "r2s_sync_xxxxx"
protocol_version = 1
```

Example third-party advertisement:

```toml
spec_version = 1
kind = "upstream"
status = "active"
game_key = "example_game_661f5423"
release_id = "8e0d3f0d1c7f2db6f4e1b2f5d0cc9c65a76a4d8a"
instance_id = "6d124f1a-1854-4f63-95da-bf487ec26f48"
role = "third_party"
published_at = 1713700000
base_url = "https://mirror.example.net"
auth_mode = "sync_token"
sync_token = "r2s_sync_yyyyy"
protocol_version = 1
```

Separating release files from upstream files is important because:

- release manifests must stay immutable
- `sync_token` rotation must not mutate old release files
- upstream access facts may need a new advertisement body without rewriting old release files

Ret2Shell does **not** emit registry revocation records in v1.

If a mirror is detached or becomes unavailable, the registry entry may stay stale until external registry tooling updates it, but consumers must still rely on the live upstream handshake before accepting the mirror.

### 7.6 Registry conflict rules

When multiple registry sources contain the same `game_key` and `release_id`:

- if `snapshot_commit` and release content match, the records are equivalent and may be merged in the local view
- if the release content differs, the local UI should mark the release as conflicting instead of silently picking a winner
- upstream advertisements are always advisory and must still be verified against the live upstream handshake before use

## 8. Platform Identity and Release Storage

Each Ret2Shell instance needs a stable `instance_id`.

Recommendation:

- generate a UUID on first boot
- store it in durable local configuration or a durable config table
- never derive it from the current base URL

The base URL may change. The instance identity must not.

The platform should also store local release records for served releases.

Recommended local release record fields:

| Field | Meaning |
| --- | --- |
| `game_id` | local game row |
| `release_id` | immutable release ID |
| `game_key` | stable sync key |
| `snapshot_commit` | repo commit for this release |
| `manifest_body` | canonical release manifest |
| `created_at` | local record time |
| `origin_role` | `first_party` or `mirror` |
| `first_party_instance_id` | authoritative origin |
| `first_party_base_url` | authoritative origin URL |

For each local release record, create a dedicated git ref in the game repo:

```text
refs/ret2shell/releases/<release_id>
```

This ensures that the exact released snapshot remains addressable even after newer commits or newer releases exist.

## 9. Proposed Database Changes

### 9.1 `game` table additions

Suggested additions:

| Column | Type | Purpose |
| --- | --- | --- |
| `sync_key` | text nullable, unique after set | stable cross-instance game key |
| `sync_token` | text nullable | dedicated sync token, never reused from `token` |

Rules:

- existing local games can backfill `sync_key = bucket` where `bucket` exists
- new local games should get a new `sync_token` on creation
- `sync_key` becomes immutable after first publication or after remote import

### 9.2 New `game_remote_sync` table

This table exists only for remotely synchronized games.

Suggested fields:

| Column | Type | Purpose |
| --- | --- | --- |
| `game_id` | FK / PK | owning local game |
| `state` | enum | `mirror_locked` or `detached` |
| `current_release_id` | text | current mirrored release |
| `snapshot_commit` | text | current mirrored snapshot commit |
| `manifest_body` | json or text | last accepted release manifest |
| `first_party_instance_id` | text | authoritative source instance |
| `first_party_base_url` | text | authoritative source URL |
| `selected_upstream_instance_id` | text | upstream chosen for current sync |
| `selected_upstream_base_url` | text | upstream chosen for current sync |
| `detached_at` | timestamp nullable | detach time |
| `detached_by` | bigint nullable | local operator who detached |

### 9.3 New `game_release` table

Stores immutable local release records.

This is used for:

- serving first-party releases
- serving third-party mirrored releases
- preserving old release refs
- validating third-party upstream advertisements

### 9.4 New `game_registry_source` table

Stores local read-only registry discovery source configuration.

These records are not publication targets and are never mutated remotely by the platform.

### 9.5 New `game_sync_job` table

Stores resumable import jobs.

Publication metadata generation is synchronous in v1 and does not mutate registry repos or enqueue long-running publish jobs.

Suggested fields:

| Field | Meaning |
| --- | --- |
| `id` | job ID |
| `mode` | `registry` or `direct` |
| `status` | `pending`, `running`, `paused`, `failed`, `completed`, `cancelled` |
| `stage` | current stage name |
| `game_id` | local target game if already created |
| `game_key` | target game key |
| `release_id` | target release |
| `registry_source_id` | selected discovery source if any |
| `upstream_instance_id` | chosen source instance |
| `upstream_base_url` | chosen source URL |
| `checkpoint` | structured resume cursor |
| `error_message` | last error |
| `created_by` | local operator |
| `created_at` / `updated_at` | timestamps |

### 9.6 `challenge` ordering

Because local challenge IDs are not portable, a synchronized release should not rely on database insertion order.

Recommended addition:

| Column | Type | Purpose |
| --- | --- | --- |
| `display_order` | integer | stable challenge ordering imported from the release manifest |

This is useful even beyond sync.

## 10. Portable Data Model

### 10.1 Data that must synchronize

| Data | Stable key |
| --- | --- |
| game release manifest | `game_key + release_id` |
| game docs in repo | repo path |
| challenge records | `challenge bucket name` inside the game repo |
| challenge text resources | repo path |
| checker, env, mapped/static/src files | repo path |
| writeup files | repo path |
| media blobs | `sha256 hash` |
| optional game-scoped OCI images | `repository + digest` |

### 10.2 Data that must stay local-only

| Data | Why |
| --- | --- |
| `game.id`, `challenge.id`, `hint.id`, `media.id` | auto-increment IDs are not portable |
| admins | local user IDs are different on every instance |
| institute restrictions | local institute IDs are different on every instance |
| event `token` | must not be reused for sync |
| teams, submissions, results | explicitly out of scope |
| runtime pods, traffic mapping, node selector, lifecycle | deployment-local state |

### 10.3 Fields that should be synchronized from manifest instead of local IDs

The release manifest should carry any portable metadata that is not already present in the repo, including:

- challenge `display_order`
- challenge `hidden`
- challenge `score`
- challenge `release_at`
- challenge `archive_at`

This lets the target instance build a faithful archived mirror without copying upstream numeric IDs.

## 11. Sync Token Policy

The current game `token` must remain dedicated to event/device behavior.

The new `sync_token` exists only for content synchronization.

Rules:

1. `sync_token` must never be accepted by any write endpoint.
2. `sync_token` must never grant access to player/team/submission data.
3. Rotating `sync_token` must not affect the current event/device token.
4. Externally published upstream advertisements may include `sync_token` only because it is read-only and release-scoped by policy.

Recommended mapping to the existing `access_policy.sync` field:

- `0`: public sync allowed; generated publication metadata may be published through public or private channels
- `1`: restricted sync; generated publication metadata must only be published through controlled/private channels
- `2`: sync disabled; no release metadata generation or remote serving

For `sync = 1`, Ret2Shell may still generate metadata, but the external publication workflow must not expose that metadata through a public registry.

## 12. Upstream Sync Protocol

To avoid conflict with the existing cluster image registry routes, the new API should live under a dedicated prefix such as:

```text
/api/sync/v1/
```

### 12.1 Discovery endpoints

Recommended endpoints:

- `GET /api/sync/v1/info`
  - returns `instance_id`, supported protocol version, base URL
- `GET /api/sync/v1/games`
  - lists released games by `game_key`
- `GET /api/sync/v1/games/{game_key}`
  - lists releases for that game
- `GET /api/sync/v1/games/{game_key}/releases/{release_id}`
  - returns the canonical release manifest and live upstream status

### 12.2 Git transport

The repo snapshot should be downloaded with git smart HTTP, not as ad-hoc zip files.

Recommended endpoints:

- `GET /api/sync/v1/games/{game_key}/releases/{release_id}/repo/info/refs?service=git-upload-pack`
- `POST /api/sync/v1/games/{game_key}/releases/{release_id}/repo/git-upload-pack`

Behavior:

- read-only only; no receive-pack
- only archived published releases are exposed
- the advertised ref is `refs/ret2shell/releases/<release_id>`
- auth is `Authorization: Bearer <sync_token>` when required

This reuses git pack transport, incremental fetch, resume behavior, and object deduplication.

### 12.3 Media transport

Recommended endpoint:

- `GET /api/sync/v1/media/{hash}`

Behavior:

- read-only by content hash
- returns the raw media file if the hash exists and belongs to a published release
- optional HTTP range support is desirable for very large media objects

### 12.4 Live mirror validation

Before accepting a third-party upstream, the consumer must verify the live handshake.

The serving instance must reject if:

- the local mirror is not `mirror_locked`
- the requested release is not recorded locally
- the game has been detached
- the requested `release_id` does not match the recorded release ref

Return `409 Conflict` in those cases.

This is the main protection against stale registry advertisements.

## 13. Publication Flow

### 13.1 Preconditions

A game may generate first-party publication metadata only when all of the following are true:

1. `host_type == Game`
2. the game is archived
3. the game has a valid local repo bucket
4. the game is not a remote mirror in `mirror_locked` state
5. `access_policy.sync != 2`

### 13.2 Publication steps

The publication metadata action should do the following:

1. Acquire a per-game publish lock.
2. Resolve `game_key`:
   - if `sync_key` is already set, use it
   - otherwise set `sync_key = bucket`
3. Read the current repo `HEAD` as `snapshot_commit`.
4. Validate the working tree is clean.
5. Build the canonical release manifest from:
   - repo snapshot content
   - portable game metadata
   - portable challenge metadata
   - referenced media hashes
6. Create or update the local `game_release` record.
7. Create or update the git ref `refs/ret2shell/releases/<release_id>`.
8. Produce two append-only files in the response bundle:
   - `games/<game_key>/releases/<release_id>.toml`
   - `games/<game_key>/upstreams/<instance_id>/<published_at>.toml`
9. Return the canonical file paths and file contents to the operator or external automation.

Ret2Shell does not choose a target registry repo, branch, review flow, or push strategy.

The publish operation is idempotent because:

- the release file path is content-addressed by `release_id`
- upstream advertisements are append-only

### 13.3 Why the token is not stored inside the release file

The original requirement asks for one release message containing token, key, upstream, and snapshot commit.

In implementation terms, the safer design is:

- immutable release file for snapshot facts
- append-only upstream advertisement for mutable access facts

Both files are returned together as one metadata bundle, so the operator still experiences one publication action, but token rotation remains possible later and the actual git commit/push stays outside Ret2Shell.

## 14. One-Click Sync Flow

### 14.1 Inputs

The operator chooses:

- direct upstream mode, or a release discovered from a read-only registry source
- the `game_key`
- the `release_id`
- the upstream instance to download from
- whether to export third-party upstream metadata after success

### 14.2 Job stages

Recommended stages:

1. `discover`
2. `validate_upstream`
3. `fetch_repo`
4. `fetch_media`
5. `prepare_import`
6. `finalize`
7. `export_third_party_metadata` (optional)

### 14.3 Stage details

#### Stage 1: discover

- fetch or refresh the selected registry source, unless direct mode is used
- resolve the chosen release and candidate upstreams
- store the decision in `game_sync_job`

#### Stage 2: validate upstream

- call the upstream release endpoint
- verify that `game_key`, `release_id`, and `snapshot_commit` match the registry record
- verify protocol version compatibility

#### Stage 3: fetch repo

- use a local bare mirror cache such as:

```text
<sync.path>/mirrors/<instance_id>/<game_key>.git
```

- fetch `refs/ret2shell/releases/<release_id>` from the selected upstream
- create a staging working tree checkout under the job directory
- verify the checkout `HEAD` equals `snapshot_commit`

This stage is naturally resumable because git fetch is incremental.

#### Stage 4: fetch media

- iterate over `assets.media_hashes` from the release manifest
- skip hashes already present in the local media store
- download missing hashes one by one into temporary `.part` files
- atomically move completed files into the final media store location
- upsert local media DB rows by hash

If `assets.oci_images` is present, the same stage must also mirror the required OCI images by digest into the local registry namespace for the imported game.

Because media is content-addressed, this stage is resumable and deduplicated by design.

#### Stage 5: prepare import

- parse the release manifest
- derive the local bucket path
- if a new game is being created, reserve the target bucket path
- if an existing mirror is being updated, keep the current live game untouched until finalization

#### Stage 6: finalize

The finalize stage must be transactional from the perspective of the local game.

Recommended behavior:

1. Acquire the target game bucket lock.
2. Create or update the local game row.
3. Import or reconcile challenge rows using stable keys from the release manifest.
4. Swap the staged repo working tree into the final bucket path atomically.
5. Persist the `game_remote_sync` state as `mirror_locked`.
6. Persist the local `game_release` record and release ref.

If finalization fails, the previously visible local game state must remain unchanged.

#### Stage 7: export third-party upstream metadata

If the operator requested it:

- verify again that the local mirror is still `mirror_locked`
- verify the local release ref exists and matches the imported `release_id`
- return a third-party upstream advertisement metadata bundle for external publication

## 15. Direct Sync Without Registry

Direct sync is the same pipeline without registry lookup.

The operator provides either:

- a source base URL and a `game_key`, or
- a source base URL and then browses releases from the remote `/api/sync/v1/games` endpoint

Then the platform:

1. queries the remote release metadata directly
2. chooses a release and upstream from that single instance
3. runs the same repo/media/import stages

Direct sync is especially useful for:

- private or temporary exchanges
- `access_policy.sync = 1` games
- internal testing before public registry publication

## 16. Import Rules for the Target Instance

### 16.1 Repo handling

The target instance should keep the mirrored repo byte-identical to the upstream release snapshot.

Do **not** rewrite repo files in place after download.

If a local game is already a `mirror_locked` remote mirror for the same `game_key`, a newer release may replace that mirror in place, but only through a staged repo swap and one transactional metadata update.

That is important because:

- the repo must remain valid for third-party serving
- the mirrored commit IDs must stay identical to the upstream
- later git fetches should remain incremental

### 16.2 Local game creation

When importing a new mirror:

- create a new local game with new local IDs
- generate a new local event `token`
- generate a new local `sync_token`
- set local admins to the importing operator or the chosen local admin set
- set `game.sync_key` to the upstream `game_key`
- set the remote sync row to `mirror_locked`

### 16.3 Challenge reconciliation

Challenge matching must use `challenge bucket name` from the repo, not local challenge IDs.

For remote snapshot sync, the importer should support full reconciliation:

- create missing challenges
- update existing challenges
- remove challenges no longer present in the imported release

This differs from the current local git push sync path, which is intentionally more conservative.

### 16.4 Imported fields and local defaults

Recommended synchronized fields:

- game name, brief, timing, archive policy, sync policy, cover/logo refs, docs
- challenge config, descriptions, answers, hints, env, checker, repo assets
- challenge `display_order`, `hidden`, `score`, `release_at`, `archive_at`

Recommended local-only fields:

- admins
- event `token`
- `sync_token`
- institute restrictions
- runtime-specific fields such as node selector, traffic, lifecycle

## 17. Media Synchronization Design

### 17.1 Why media needs a separate path

Media files are not stored in the game bucket repo.

They already have a stable identifier: the SHA-256 hash stored by the media subsystem.

That makes media sync naturally content-addressed.

### 17.2 Manifest generation

During publication, build `assets.media_hashes` by scanning portable fields that may reference media:

- game cover/logo when they are hash-backed
- game docs and challenge markdown files for `/media?hash=<64hex>` references
- any normalized absolute media URLs pointing back to the current source instance

If a field references a repo-relative file instead of a media hash, keep it as a repo asset and do not place it into `media_hashes`.

### 17.3 Local media import

When importing media:

- use the media hash as the only stable identifier
- if the hash already exists locally, do not re-download it
- create the local DB row by hash only
- use a reserved system uploader account or another explicit internal ownership strategy

The importer must never attempt to preserve upstream `media.id`.

### 17.4 Content rendering

Because the mirrored repo should stay byte-identical, media URL localization should happen at render/import time, not by mutating the repo.

Recommended rule:

- whenever synchronized markdown or docs are rendered locally, rewrite any recognized upstream media URL into the local canonical media URL form

### 17.5 Internal-managed OCI image sync

If a challenge environment references images with `internal_managed = true`, the release manifest must also carry `assets.oci_images` entries.

Recommended rules:

- if an image is public and already references a stable public repository, do not mirror it just for sync
- if an image is `internal_managed`, mirror it by digest into the target instance's local game registry namespace and rebuild the runtime pull reference from `registry.external + local_game_bucket + internal_tag`
- copy by digest, not by local numeric ID or by mutable tag alone
- do not rely on anonymous raw access to the upstream registry; the sync flow must adapt Ret2Shell's docker registry proxy and authorization model

Recommended transport design:

- the upstream sync API should expose a sync-aware registry relay or sync-aware registry auth flow for `assets.oci_images`
- the relay should validate `sync_token`, `game_key`, `release_id`, `source_repository`, and the full manifest/blob digest closure reachable from each declared root digest
- the importer should pull from the upstream through that sync-aware path, then push into the local registry namespace using local trusted credentials
- existing Ret2Shell registry proxy behavior remains the underlying transport, but sync must use a release-scoped authorization path instead of ordinary game-admin login state

This keeps archived mirrors self-contained enough to re-enable runtime behavior later if the operator decides to detach and reuse the game locally.

## 18. Immutability and Detach Rules

### 18.1 Locked mirror behavior

When a game is in `mirror_locked` state, all local mutation paths must reject.

This includes at least:

- game patch/update
- game admin changes that alter mirrored metadata
- document edits
- challenge create/update/delete
- hint mutations
- answer edits
- attachment uploads/deletes
- checker/env edits
- repo receive-pack or any git write path

Read-only operations remain allowed.

Local deletion of the whole mirror may still be allowed as an administrative cleanup operation.

### 18.2 Detach behavior

If an operator wants to edit a synchronized game, they must explicitly detach it.

Detach does the following:

1. switch `game_remote_sync.state` from `mirror_locked` to `detached`
2. keep the recorded origin metadata for auditability
3. re-enable local write operations
4. make future third-party upstream serving invalid

### 18.3 Third-party upstream rejection after detach

Once detached, this instance must reject future sync requests for that game as a third-party upstream.

Enforcement rules:

- live upstream handshake returns `409 Conflict`
- no registry-side revocation is required; stale advertisements are tolerated because live validation is authoritative

The registry is therefore only a discovery index. Final trust always comes from live upstream validation.

## 19. Resumability and Failure Recovery

### 19.1 General principles

The sync pipeline must be resumable at stage boundaries.

Rules:

- never expose a half-imported game as complete
- keep long-running downloads outside the final DB transaction
- use staging directories for repo checkouts
- use content-addressed media files so completed objects are reusable

### 19.2 Suggested on-disk layout

Recommended sync workspace:

```text
<sync.path>/
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

### 19.3 Retry behavior

- registry fetch failure: retry fetch, no local game impact
- upstream handshake failure: allow switching to another upstream for the same release
- git fetch failure: resume from the same mirror cache or switch to another upstream advertising the same release
- media failure: retry only missing hashes
- finalization failure: keep the old live game state untouched and leave the job resumable

### 19.4 Publication metadata replay behavior

Ret2Shell emits deterministic append-only file bodies and relative paths.

If an external git workflow fails or needs rebasing, the operator or CI pipeline can reuse the same generated metadata bundle without asking Ret2Shell to mutate any registry repo.

## 20. Upstream Selection Rules

When multiple upstreams advertise the same release, the UI should show:

- role: first-party or third-party
- source registry name
- base URL
- last published time
- current handshake status

Suggested default preference:

1. healthy first-party upstream
2. healthy third-party upstream
3. manual user override

The user must always be able to choose a different upstream manually.

If the chosen upstream fails, the job may resume from another upstream **only if** the release manifest matches exactly.

## 21. Security Model

The security boundary is intentionally simple in v1:

- trust is rooted in the local operator's chosen registry sources and direct upstream URLs
- `sync_token` is a read-only capability, not an admin credential
- live upstream handshake is mandatory before download
- third-party mirrors must prove that they are still locked before serving

Future improvements such as signed release manifests or signed upstream advertisements can be added later without changing the basic data model.

## 22. Suggested Implementation Order

### Phase 1: Core identity and direct sync

- add `sync_key` and `sync_token`
- add local release records and release refs
- add direct upstream sync endpoints
- add resumable sync jobs
- add locked mirror state and detach operation

### Phase 2: First-party publication metadata

- implement registry repo format
- implement first-party publication metadata generation
- keep registry commit/push outside the platform boundary

### Phase 3: Third-party upstream serving

- enforce live mirror validation and rejection after detach

### Phase 4: Registry-backed import and third-party metadata export

- add read-only registry discovery source CRUD
- implement registry catalog browsing and import
- allow successful mirrors to export third-party upstream advertisement metadata
- add upstream health display and registry conflict handling UX

### Phase 5: UX polish and recovery hardening

- sync retry and resume UX
- richer error reporting and recovery actions

## 23. Final Recommendation

The cleanest v1 design is:

1. Use `game_key` as the global identity, initially derived from the original `bucket`.
2. Add a dedicated `sync_token` and never reuse the existing event token.
3. Store immutable release manifests and append-only upstream advertisements in a git-backed registry repo, but let Ret2Shell only generate the required file paths and contents instead of pushing them directly.
4. Serve released repo snapshots by git smart HTTP using per-release refs.
5. Synchronize media by content hash, not by DB ID.
6. If any challenge image is `internal_managed`, synchronize the required OCI images through a sync-aware docker registry proxy/auth path and rebuild local pull references from `internal_tag`.
7. Rebuild local DB rows from stable keys (`game_key`, challenge bucket names, media hashes, display order), never from upstream numeric IDs.
8. Keep synchronized games in `mirror_locked` state until the operator explicitly detaches them.
9. Reject third-party upstream serving immediately after detach, without requiring registry-side revocation automation.

This design keeps the sync path aligned with the existing git bucket architecture, avoids ID portability problems, supports interruption and recovery, and gives the registry a simple conflict-resistant format.
