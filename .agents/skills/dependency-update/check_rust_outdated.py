#!/usr/bin/env python3
"""Check Cargo workspace dependencies for semver-breaking version updates.

Queries the crates.io API for the latest version of each external workspace
dependency and reports crates whose latest version is a breaking upgrade from
the version declared in Cargo.toml.

For pre-1.0 crates (0.x.y), a minor bump is treated as breaking.
For 1.0+ crates, only a major bump is treated as breaking.

Usage:
    python3 check_rust_outdated.py [--project-dir /path/to/project]

When --project-dir is omitted, the current working directory is used.
"""

import argparse
import json
import re
import sys
import tomllib
import urllib.request
from pathlib import Path
from urllib.error import HTTPError


def parse_semver(version: str) -> tuple[int, int, int]:
    """Parse a semver-ish string into (major, minor, patch).

    Cargo version requirements are often written as `1.1`, `0.5`, or even `1`.
    Missing components are treated as 0.
    """
    m = re.match(r"^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:[+-].*)?$", version)
    if not m:
        raise ValueError(f"Cannot parse semver from {version!r}")
    major = int(m.group(1))
    minor = int(m.group(2)) if m.group(2) is not None else 0
    patch = int(m.group(3)) if m.group(3) is not None else 0
    return major, minor, patch


def is_breaking_update(current: str, latest: str) -> bool:
    """Determine whether `latest` is a semver-breaking upgrade from `current`.

    For pre-1.0 crates (0.x.y), a minor bump is treated as breaking.
    For 1.0+ crates, only a major bump is breaking.
    """
    cur_major, cur_minor, _ = parse_semver(current)
    lat_major, lat_minor, _ = parse_semver(latest)

    if cur_major == 0:
        return (lat_major, lat_minor) > (cur_major, cur_minor)
    return lat_major > cur_major


def crates_io_latest(crate: str) -> dict | None:
    """Fetch the latest non-yanked version info for a crate from crates.io."""
    url = f"https://crates.io/api/v1/crates/{crate}"
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "dependency-update-checker (skill script)",
            "Accept": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except HTTPError as e:
        print(f"[ERROR] crates.io returned {e.code} for {crate}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[ERROR] failed to fetch {crate}: {e}", file=sys.stderr)
        return None

    versions = data.get("versions", [])
    for v in versions:
        if not v.get("yanked", False):
            return {"crate": crate, "latest": v["num"]}
    return None


def normalize_version_req(req: str) -> str:
    """Normalize a Cargo version requirement to a concrete lower bound."""
    req = req.strip()
    req = req.lstrip("^=").strip()
    return req


def find_breaking_updates(project_dir: Path) -> list[dict]:
    """Scan workspace dependencies in project_dir/Cargo.toml for breaking updates."""
    cargo_toml = project_dir / "Cargo.toml"
    if not cargo_toml.exists():
        raise FileNotFoundError(f"Cargo.toml not found in {project_dir}")

    with cargo_toml.open("rb") as f:
        manifest = tomllib.load(f)

    deps = manifest.get("workspace", {}).get("dependencies", {})

    candidates = []
    for name, spec in deps.items():
        # Skip internal path-only crates. Adjust the prefix as needed.
        if name.startswith("r2s-"):
            continue
        if isinstance(spec, dict):
            if "path" in spec:
                continue
            version = spec.get("version")
        elif isinstance(spec, str):
            version = spec
        else:
            continue

        if not version:
            continue

        candidates.append((name, normalize_version_req(version)))

    print(f"Checking {len(candidates)} external workspace dependencies...\n")

    breaking_updates = []
    for crate, current in candidates:
        info = crates_io_latest(crate)
        if info is None:
            continue
        latest = info["latest"]
        try:
            if not is_breaking_update(current, latest):
                continue
        except ValueError as e:
            print(f"[WARN] skipping {crate}: {e}", file=sys.stderr)
            continue

        breaking_updates.append(
            {"crate": crate, "current": current, "latest": latest}
        )
        print(f"MAJOR: {crate} {current} -> {latest}")

    print(f"\nFound {len(breaking_updates)} breaking-version update candidate(s).")
    return breaking_updates


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Check Cargo workspace deps for breaking version updates."
    )
    parser.add_argument(
        "--project-dir",
        type=Path,
        default=Path.cwd(),
        help="Project root containing Cargo.toml (default: current directory).",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=None,
        help="Output JSON file path (default: <project-dir>/outdated_rust_major.json).",
    )
    args = parser.parse_args()

    project_dir = args.project_dir.resolve()
    try:
        updates = find_breaking_updates(project_dir)
    except FileNotFoundError as e:
        print(f"[ERROR] {e}", file=sys.stderr)
        return 1

    output_path = args.output or (project_dir / "outdated_rust_major.json")
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(updates, f, indent=2)
    print(f"Report written to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
