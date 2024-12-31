#!/bin/sh

command_t() {
    if command -v "$1" 2>&1 >/dev/null; then
        return 0
    else
        return 1
    fi
}

x1b=$(printf '\033')

# version info
app_v="$(grep -m 1 -oP '^\s*version\s*=\s*"\K[^"]+' Cargo.toml 2>/dev/null || echo "unknown")"
git_v="$(command_t git && git describe --abbrev=8 --always --dirty='*' 2>/dev/null || echo "unknown")"
echo '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-'
echo "${x1b}[1;34mR${x1b}[0met 2 ${x1b}[1;31mS${x1b}[0mhell OCI Distribution Script" && echo
echo "Build on version: ${x1b}[1;32m$app_v-$git_v${x1b}[0m"

# prepare build command
buildkit=""
build_args=""

if command_t docker; then
    buildkit=docker
elif command_t podman; then
    buildkit=podman
    build_args="--format docker"
elif command_t buildah; then
    buildkit=buildah
    build_args="--format docker"
else
    echo "No image buildkit found"
    exit 1
fi

echo "Building image with ${x1b}[1;32m$buildkit${x1b}[0m"
echo "-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-" && echo
$buildkit build $build_args --build-arg R2S_GIT_VERSION=$git_v -t ret2shell:latest -f Containerfile .