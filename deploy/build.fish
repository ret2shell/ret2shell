#!/bin/fish

pnpm --prefix=web install
pnpm --prefix=web build
cd ./server && podman build -t ret2shell .
