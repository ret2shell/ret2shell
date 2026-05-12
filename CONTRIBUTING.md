# Contributing to Ret2Shell

Ret2Shell welcomes focused contributions that improve the product without making the codebase harder to maintain. This guide is for people preparing a patch, review, or follow-up task.

## Before You Start

Read the repository structure first so changes land in the right place.

- Backend code lives in [crates/](crates/).
- Frontend code lives in [web/](web/).
- Configuration, deployment, and support material live under the top-level project folders.

Prefer working in the smallest area that actually owns the behavior you want to change. If a patch can stay local, keep it local.

## Code Style

Match the surrounding code instead of introducing a new style for one file.

- Rust files should follow [rustfmt.toml](rustfmt.toml) and the repository's existing development habits and conventions.
- Frontend code should follow the existing SolidJS patterns in the repository.
- Reuse existing helpers, shared modules, and naming conventions whenever possible.
- Keep translations aligned with [web/src/lib/i18n/index.ts](web/src/lib/i18n/index.ts) when UI text changes.

When you touch formatting-sensitive code:

- Run `cargo +nightly fmt` for Rust changes.
- Run `pnpm -C web format` for frontend formatting.
- Run `pnpm -C web lint` for frontend checks.

## Commit Style

Commit history should tell a clear story.

- Use [gitmoji](https://gitmoji.dev/) commit messages in the form `<gitmoji> <summary>`.
- Write the summary as an action, not a file list.
- Keep each commit to one logical change when practical.
- Avoid bundling unrelated cleanup into a feature or bug fix.

> [!NOTE]
> Please use the gitmoji shortcodes (e.g., `:sparkles:`) instead of raw emojis in commit messages.

Examples:

- `:bug: fix registry tag publishing`
- `:memo: improve contributing guide`
- `:art: align frontend formatting`

## Pull Request Style

Treat a PR as a reviewable package, not a dumping ground for work-in-progress.

- Use a short title that reflects the primary change.
- Use the matching gitmoji shortcode in the title.
- Add labels that match the change type and priority so the PR can be filtered and triaged quickly.
- Explain what changed, why it changed, and any notable tradeoffs.
- Mention validation results when the change affects build, release, or runtime behavior.
- Put follow-up work in a separate PR or call it out clearly.

## Validation Style

Pick the lightest check that still gives confidence in the change.

- For frontend work, start with `pnpm -C web lint` and `pnpm -C web format`.
- For Rust work, start with `cargo +nightly fmt` and targeted tests when available.
- Use `cargo clippy` when the change is non-trivial or touches Rust logic that benefits from extra checking.
- If the change is documentation only, a careful read-through is usually enough.

## Good Habits

- Keep branch names short and kebab-case.
- Make unrelated work into a separate commit or follow-up PR.
- Prefer explicit explanations over assumptions in commit messages and PR descriptions.
- When in doubt, leave the patch smaller and describe the rest clearly in the PR.
