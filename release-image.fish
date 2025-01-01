#!/bin/fish

function print_error
    echo -e "\033[1;31mError:\033[0m $argv"
end


# print info
set app_v (grep -m 1 -oP '^\s*version\s*=\s*"\K[^"]+' Cargo.toml; or echo "unknown")
set git_v (command -q git; and git describe --abbrev=8 --always --dirty='*' 2>/dev/null; or echo "unknown")

echo '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-'
echo -e "\033[1;34mR\033[0met 2 \033[1;31mS\033[0mhell OCI Distribution Script\n"
echo -e "Build on version: \033[1;36m$app_v-$git_v\033[0m"

# detect buildkit
if command -q docker
    set buildkit docker
else if command -q podman
    set buildkit podman
    set build_args --format docker
else if command -q buildah
    set buildkit buildah
    set build_args --format docker
else
    echo -e '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n'
    echo "No image buildkit found"
    exit 1
end

echo -e "Building image with \033[1;36m$buildkit\033[0m"
echo -e '-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-=-\n'

# check required files
if not test -f "config/pub.bin"
    print_error "File \033[1;33mconfig/pub.bin\033[0m is required, but not found"
    exit 1
end

# build image
$buildkit build $build_args --build-arg R2S_GIT_VERSION=$git_v -t ret2shell:latest -f Containerfile .
