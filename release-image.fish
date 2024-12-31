#!/bin/fish

set app_v (grep -m 1 -oP '^\s*version\s*=\s*"\K[^"]+' Cargo.toml; or echo "unknown")
set git_v (command -q git; and git describe --abbrev=8 --always --dirty='*' 2>/dev/null; or echo "unknown")

echo '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-'
echo -e "\033[1;34mR\033[0met 2 \033[1;31mS\033[0mhell OCI Distribution Script\n"
echo -e "Build on version: \033[1;32m$app_v-$git_v\033[0m"

if command -q docker
    set buildkit docker
else if command -q podman
    set buildkit podman
    set build_args --format docker
else if command -q buildah
    set buildkit buildah
    set build_args --format docker
else
    echo "No image buildkit found"
    exit 1
end

echo -e "Building image with \033[1;32m$buildkit\033[0m"
echo -e '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n'
$buildkit build $build_args --build-arg R2S_GIT_VERSION=$git_v -t ret2shell:latest -f Containerfile .
