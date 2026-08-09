---
name: version-bump
description: Bump the Ret2Shell version number across all relevant files — Cargo workspace, frontend, Helm chart, and K8s deployment references. Use when the user asks to bump, release, or change the version number.
---

# Version Bump Skill for Ret2Shell

This skill describes the complete version bumping procedure for the Ret2Shell monorepo. The version must be kept in sync across all of the following locations.

## Files to Update

Whenever the version is bumped, edit these files (listed in the order they should be changed):

| # | File | Field(s) |
|---|------|----------|
| 1 | `Cargo.toml` | `workspace.package.version` (line ~12) — all 17 sub-crates inherit from this via `version = { workspace = true }` |
| 2 | `web/package.json` | `"version"` field |
| 3 | `web/.env` | `VITE_COMPAT_VERSION` |
| 4 | `deploy/helm/ret2shell/Chart.yaml` | `version` (line 5) and `appVersion` (line 6) |
| 5 | `deploy/helm/ret2shell/values.yaml` | `platform.image.tag` (line ~15) |
| 6 | `deploy/k8s/values.private.example.yaml` | `platform.image.tag` (line 3) |
| 7 | `deploy/k8s/README.md` | `R2S_VERSION` shell variable (two occurrences — install and update examples) |

After editing all seven files, run `cargo check` (or `cargo build`) to regenerate `Cargo.lock` with the new workspace version. The lock file will update automatically — no manual editing needed.

## Commit and Tag Format

### Version bump commit

The commit that bumps the version should use the `:tada:` gitmoji followed by the version number only:

```
:tada: 3.11.2
```

Do not use `:bookmark:` or a longer description for this commit.

### Release tag

When creating a Git tag for a release, use the plain version number **without** a `v` prefix. For example, for version `3.11.2`, the tag must be:

```
3.11.2
```

Not `v3.11.2`.

## Files That Do NOT Need Manual Changes

These files read the version dynamically at build/release time and will pick up the new version automatically:

- `release-image.sh` — reads `Cargo.toml` at build time via `grep`
- `.github/workflows/release.yml` — validates that `Cargo.toml`, `Chart.yaml` (version + appVersion), and `values.yaml` (image tag) all match the Git tag
- `web/src/lib/storage/platform.ts` — reads `VITE_COMPAT_VERSION` from environment at build time

## Files That Must NOT Be Changed

- `docs/software-copyright-application.md` — historical document referencing a specific past version (keep as-is)
- `crates/config/src/cluster.rs` — `#[deprecated(since = "...")]` annotations mark when a field was deprecated (keep the original version)
