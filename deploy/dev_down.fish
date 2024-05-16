#!/bin/fish
tmux kill-session -t ret2shell
docker compose -f ./deploy/compose.dev.yml down
