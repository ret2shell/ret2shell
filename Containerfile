FROM rust:1.90-alpine AS server

# hadolint ignore=DL3018
RUN apk add --update --no-cache musl-dev clang lld

COPY ./.cargo /var/lib/ret2shell/.cargo
COPY ./config /var/lib/ret2shell/config
COPY ./Cargo.toml /var/lib/ret2shell/Cargo.toml
COPY ./crates /var/lib/ret2shell/crates
WORKDIR /var/lib/ret2shell

ARG R2S_GIT_VERSION=DEADBEEF
ENV R2S_GIT_VERSION=${R2S_GIT_VERSION}

RUN --mount=type=cache,target=/var/lib/ret2shell/target cargo update && \
    cargo build --release --bin r2s-server --target x86_64-unknown-linux-musl && \
    cp /var/lib/ret2shell/target/x86_64-unknown-linux-musl/release/r2s-server /usr/local/bin/r2s-server

FROM node:lts-alpine AS frontend

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

COPY ./web/package.json ./web/pnpm-lock.yaml /var/lib/ret2shell/web/
WORKDIR /var/lib/ret2shell/web
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile

COPY ./web /var/lib/ret2shell/web
RUN pnpm build && \
    mkdir -p /var/www/html && \
    cp -r ./dist/* /var/www/html/

FROM alpine:3

# hadolint ignore=DL3018
RUN apk add --update --no-cache curl git skopeo tini && \
    git config --global user.email platform@ret.sh.cn && \
    git config --global user.name Ret2Shell

COPY --from=server /usr/local/bin/r2s-server /bin/r2s-server
COPY --from=frontend /var/www/html /var/www/html

RUN mkdir -p \
    /var/log/ret2shell \
    /var/cache/ret2shell \
    /var/lib/ret2shell

# if you changes the server port in deployment, maybe you should request for a new distribution
HEALTHCHECK --interval=5m --timeout=3s --start-period=10s --retries=1 \
    CMD curl -fsSL http://localhost:8080/api/ping || exit 1

ENTRYPOINT ["/sbin/tini", "--", "/bin/r2s-server"]
