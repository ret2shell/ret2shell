#!/bin/fish

if not command -q tmux
    echo -e "\033[32mtmux\033[0m not found, please install it first."
    exit 1
end

if not command -q podman
    echo -e "\033[32mpodman\033[0m not found, please install it first."
    exit 1
end

if not command -q /usr/lib/podman/aardvark-dns
    echo -e "\033[32maardvark-dns\033[0m not found, please install it first."
    exit 1
end

if not command -q cargo
    echo -e "\033[32mcargo\033[0m and rust-toolchains not found, please install it first."
    exit 1
end

if not command -q pnpm
    echo -e "\033[32mpnpm\033[0m not found, please install it first."
    exit 1
end

docker compose -f ./deploy/compose.dev.yml up -d

tmux new-session -d -s ret2shell 'cargo run'
tmux split-window -t ret2shell:0 -h 'cd ./web && pnpm dev --host'
tmux attach-session -t ret2shell
