# Ret2Shell AGENTS Instructions

## Overview

Follow these instructions when contributing to this repository. Keep changes minimal and consistent with existing conventions.

## Repository Structure

- **Backend**: Rust services and libraries under `crates/`.
- **Frontend**: SolidJS application under `web/`.

## Frontend (SolidJS + TypeScript)

- Use SolidJS idioms with functional components.
- Prefer existing helpers in `web/src/lib` and keep imports organized.
- Formatting and linting are handled by Biome:
  - `pnpm --prefix web format`
  - `pnpm --prefix web lint`
- Follow the existing file structure: routes in `web/src/routes`, reusable widgets in `web/src/lib/widgets`, and API modules in `web/src/lib/api`.

## Backend (Rust)

- Follow the formatting conventions in `rustfmt.toml` (2-space indentation, same-line braces).
- Favor existing helpers in `crates/*/src` and keep modules aligned with current structure.
- Run formatting with `cargo fmt --all` when touching Rust files.

## Git & Pull Request Conventions

- **Commit format**: Use gitmoji (emoji shortcodes, see https://gitmoji.dev) for every commit, followed by a concise message.
  - Format: `<gitmoji> <summary>`
  - Example: `:sparkles: add new challenge export`
- **Common gitmoji**:
  - `:sparkles:` New feature
  - `:bug:` Bug fix
  - `:memo:` Documentation
  - `:recycle:` Refactor
  - `:art:` Formatting/style changes
  - `:zap:` Performance improvement
  - `:white_check_mark:` Tests
  - `:construction:` Work in progress
  - `:fire:` Remove code or files
  - `:package:` Dependency updates
- **Scope**: One logical change per commit; keep commits small and focused.
- **PR Title**: Prefix with the same gitmoji shortcode as the primary change.
  - Example: `:memo: update AGENTS instructions`
- **PR Description**: Include a brief summary plus any testing performed.
- **Branch naming**: Use short, kebab-case names (e.g., `docs/git-guidelines`).

## Testing

- Only run tests relevant to your changes.
- Frontend: `pnpm --prefix web lint` (and `format` if needed).
- Backend: `cargo fmt --all` and targeted test commands if applicable.
