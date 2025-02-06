FROM rust:1-alpine as builder

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

# --------------------------------------------------------------------------------------------------------

FROM alpine:3

# hadolint ignore=DL3018
RUN apk add --update --no-cache curl git skopeo && \
    git config --global user.email platform@ret.sh.cn && \
    git config --global user.name Ret2Shell

COPY --from=builder /usr/local/bin/r2s-server /bin/r2s-server

RUN mkdir -p \
    /var/www/html \
    /var/log/ret2shell \
    /var/cache/ret2shell \
    /var/lib/ret2shell

# if you changes the server port in deployment, maybe you should request for a new distribution
HEALTHCHECK --interval=5m --timeout=3s --start-period=10s --retries=1 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:8080/api/ping || exit 1

ENTRYPOINT ["/bin/r2s-server"]
