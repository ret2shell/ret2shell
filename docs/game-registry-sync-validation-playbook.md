# Game Registry Sync Validation Playbook

## Goal

This playbook defines the manual validation matrix for the current sync implementation.

It assumes the platform now:

- exports publication metadata instead of pushing to registry repos directly
- supports direct and registry-backed import
- supports in-place upgrades for `mirror_locked` mirrors
- uses shared mirror caches, resumable media part files, and release-scoped OCI relay checks

## Suggested Test Topology

Use at least two Ret2Shell instances:

- instance A: first-party source
- instance B: importer / third-party mirror

Optional:

- registry source R1: primary discovery source
- registry source R2: conflicting discovery source for negative tests

## Fixture Requirements

Prepare one archived game on instance A with:

- multiple challenges
- markdown/media references
- at least one `internal_managed` challenge image
- a stable `sync_key`

Prepare at least two archived releases for that same game:

- release `r1`: initial import baseline
- release `r2`: newer snapshot for in-place mirror upgrade

Prepare one conflicting registry record in R2:

- same `game_key`
- same `release_id`
- different `snapshot_commit` or `manifest_sha256`

## Scenario Matrix

| ID | Scenario | Expected Result |
| --- | --- | --- |
| S1 | first-party metadata export | instance A returns canonical release/upstream files without repo push integration |
| S2 | direct import | instance B imports `r1` directly from A and creates a locked mirror |
| S3 | registry import | instance B imports `r1` from a discovery source after choosing one upstream |
| S4 | in-place upgrade | instance B upgrades the same mirror from `r1` to `r2` without creating a second local game |
| S5 | detach | detached mirror becomes editable and sync serving returns `409 Conflict` |
| S6 | media resume | interrupted media download resumes from `.sync/media-part/*.part` |
| S7 | shared mirror cache | repeated imports of the same upstream reuse `.sync/mirrors/` fetch state |
| S8 | registry conflicts | admin sync UI warns when another fetched source disagrees on the same release |
| S9 | OCI relay boundary | only digests reachable from release-declared OCI roots are accepted |
| S10 | cleanup worker | stale finished job workspaces and stale media parts are eventually removed |

## Detailed Checks

### 1. First-party Metadata Export

On instance A:

1. Open `/games/{game}/admin/sync`
2. Generate first-party publication metadata
3. Verify:
   - a local `game_release` record exists
   - `refs/ret2shell/releases/{release_id}` points to the archived snapshot
   - the UI returns release and upstream file contents only
   - no registry target, push, or PR automation is required

### 2. Direct Import

On instance B:

1. Open `/admin/sync`
2. Use direct discovery against instance A
3. Import release `r1`
4. Verify:
   - one local game is created
   - `game_remote_sync.state == mirror_locked`
   - release metadata matches the source
   - challenge order, media, and OCI-backed challenge images resolve correctly

### 3. Registry Import

On instance B:

1. Fetch discovery source R1
2. Browse `game_key` and release `r1`
3. Choose one upstream and import
4. Verify:
   - import completes successfully
   - the chosen upstream is shown in sync job details
   - discovery source conflicts do not block import when the selected source itself is valid

### 4. In-Place Mirror Upgrade

On instance B:

1. Start from an existing `mirror_locked` import of `r1`
2. Import `r2` for the same `game_key`
3. Verify:
   - the same local game ID is reused
   - the same bucket is reused
   - challenge rows are refreshed to match `r2`
   - `game_remote_sync.current_release_id == r2`
   - old release records remain auditable

### 5. Detach and Third-Party Rejection

On instance B:

1. Detach the mirror from `/games/{game}/admin/sync`
2. Verify:
   - local editing paths are enabled again
   - direct sync requests for that mirror now fail with `409 Conflict`
   - the platform does not try to publish revocation records automatically

### 6. Media Resume

On instance B:

1. Start importing a release with multiple media files
2. Interrupt during media transfer
3. Resume the same job
4. Verify:
   - `.sync/media-part/` contains partial files during interruption
   - resume continues from existing byte offsets instead of restarting every file
   - completed files are hash-verified before they are marked finished

### 7. Shared Mirror Cache

On instance B:

1. Import the same upstream release twice, or import `r1` then `r2`
2. Verify:
   - `.sync/mirrors/{instance_id}/` persists between jobs
   - later fetches are incremental
   - job workspace `jobs/{id}/repo` remains disposable scratch state

### 8. Registry Conflict Display

On instance B:

1. Fetch both R1 and R2
2. Open the selected release from R1 in `/admin/sync`
3. Verify:
   - the UI shows a warning when R2 publishes the same `game_key + release_id` with different content
   - the warning includes the conflicting source name and release identifiers

### 9. OCI Relay Boundary

On instance A:

1. Import or publish a release with `assets.oci_images`
2. From instance B, mirror the OCI assets through the sync relay
3. Verify:
   - declared root manifest digests are accepted
   - child manifest digests and blob digests reachable from those roots are accepted
   - unrelated digests from the same repository are rejected

### 10. Cleanup Worker

On any instance:

1. Leave behind finished sync job workspaces older than retention
2. Leave behind stale `.sync/media-part/*.part` files older than retention
3. Wait for the cleanup worker interval or trigger it in a dev session
4. Verify:
   - stale `jobs/` workspaces are removed
   - stale media part files are removed
   - shared mirrors are preserved

## Regression Checklist

After all sync checks, verify existing authoring flows still behave normally for non-mirror games:

- game edit pages
- repo sync
- challenge create/edit
- checker editor
- attachment upload/delete
- docs editing

## Local Commands

Run these before merging:

```bash
cargo test -p r2s-server
cargo clippy -p r2s-server -- -D warnings
pnpm -C web lint
```

Use this document as the release gate for future sync refactors.
