#!/bin/bash

app_v="$(grep -m 1 -oP '^\s*version\s*=\s*"\K[^"]+' Cargo.toml 2>/dev/null || echo "unknown")"
app_v_major="$(echo "$app_v" | cut -d. -f1)"
app_v_minor="$(echo "$app_v" | cut -d. -f2)"
app_v_patch="$(echo "$app_v "| cut -d. -f3)"
echo "APP_VERSION: $app_v"

commit_sha="$(git describe --abbrev=8 --always --dirty='*' 2>/dev/null || echo "unknown")"
echo "COMMIT_SHA: $commit_sha"

cache_v="$app_v_major.$app_v_minor"
echo "CACHE_VERSION: $cache_v"

# store to github env or output

echo "app_v=$app_v" >> "$GITHUB_ENV"
echo "app_v_major=$app_v_major" >> "$GITHUB_ENV"
echo "app_v_minor=$app_v_minor" >> "$GITHUB_ENV"
echo "app_v_patch=$app_v_patch" >> "$GITHUB_ENV"

echo "commit_sha=$commit_sha" >> "$GITHUB_ENV"
echo "R2S_GIT_VERSION=$commit_sha" >> "$GITHUB_ENV"

echo "cache_v=$cache_v" >> "$GITHUB_OUTPUT"