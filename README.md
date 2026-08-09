<div align="center">
  <a href="https://ret.sh.cn/">
    <img src="./arts/logo-full.svg" alt="Ret2Shell" style="width: 100%" />
  </a>
  <p><em>A feature-riches CTF challenge platform</em></p>

[![MSRV 1.95.0+](https://img.shields.io/badge/MSRV-1.95.0+-blue)](https://releases.rs/docs/1.95.0/)
[![Solid.js 1.9+](https://img.shields.io/badge/Solid.js-1.9+-orange)](https://www.solidjs.com/)

</div>

## 📣 Support

QQ Group: [1104642385](https://qm.qq.com/q/u0BUcpU6l2)

Telegram: [t.me/ret2shell](https://t.me/ret2shell)

## Preview

![Training Ground](arts/training-dark-en-us.webp)

## 🚀 Deployment

Ret2Shell is single binary with requirements of `redis/valkey 8+`, `postgres 18+`, `nats 2+` and optional `VictoriaLog` and `registry`.

All the components could be deploy anywhere, so you can deploy ret2shell as you like.

## 🛠️ Development

### 1. Install Toolchains

#### Install Rust for backend

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

Then use `rustup` to install the latest stable toolchain.

```bash
rustup install stable
```

You are done for backend development.

#### Install Node.js and Pnpm for frontend

```bash
curl -fsSL https://deb.nodesource.com/setup_21.x | sudo -E bash -
```

Then install pnpm

```bash
corepack enable pnpm
```

### 2. Setup Development Environment

#### Setup frontend

Frontend files are located in [web/](web/) directory. Enter the directory or add `--prefix=web` option after `pnpm` command.

Setup frontend dependencies:

```bash
pnpm install
```

#### Setup other services

See [deploy/nginx-module/ret2shell.dev.conf](deploy/nginx-module/ret2shell.dev.conf). You could put it into your nginx configuration directory like `/etc/nginx/sites-enabled/`.

You may need other services like database, redis to be configured, please refer to [deploy/docker-compose.dev.yml](deploy/compose/docker-compose.dev.yml).

Copy [config/config.sample.toml](config/config.sample.toml) to `config/config.toml`, and modify it to fit your environment.

For other deployments, see at [deploy/](deploy/).

### 3. Launch

#### Frontend

To start a development server, run the following command at [web/](web/) context:

```bash
pnpm dev --host
```

Or run `pnpm --prefix=web dev --host` at the root directory.

> [!NOTE]
>
> If you want to specify a remote backend server, you can add environment variable `VITE_DEV_API_TARGET` when running the development server. For example:
>
> ```bash
> VITE_DEV_API_TARGET=http://localhost:8080 pnpm dev
> ```
>
> This would be helpful if you only focus on frontend development.

#### Backend

Run the following command to start the backend server:

```bash
cargo run --bin r2s-server
```

### 4. Build

Make sure you have installed the toolchains.

To build frontend files:

```bash
pnpm build
```

The built files will be produced in `web/dist`.

To build backend server binary:

```bash
# if you want to host it with systemd
cargo build --release --bin r2s-server
# or you want to host it in an older linux distro
cargo build --release --bin r2s-server --target x86_64-unknown-linux-musl
```

The built binary will be produced in `target/release/`,
musl binaries will be produced in `target/x86_64-unknown-linux-musl/release/`.

You can also build the docker image:

```bash
# if you use fish
./release-image.fish
# or run with bash
./release-image.sh
```

## 🤝 Contributing

We welcome and appreciate your contributions to Ret2Shell! Please see [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on how to submit changes, commit conventions, pull request practices, and code style expectations.

If you have interesting derivative projects or extensions related to Ret2Shell, feel free to share them in [Discussions](https://github.com/ret2shell/ret2shell/discussions/categories/show-and-tell).

For general discussions and questions about Ret2Shell, you can also post in [Discussions](https://github.com/ret2shell/ret2shell/discussions).

## 📄 License

Ret2Shell is distributed under a GPL-3.0-derived custom copyleft license that incorporates GPL-3.0 in Appendix A and adds user-facing monetization restrictions. See [LICENSE](LICENSE) for the binding license text and [COMMERCIAL_POLICY.md](COMMERCIAL_POLICY.md) for plain-language guidance.

Ret2Shell is licensed under:

- [LICENSE](LICENSE): the binding license text.
- [COMMERCIAL_POLICY.md](COMMERCIAL_POLICY.md): English guidance and interpretation notes.
- [COMMERCIAL_POLICY.zh-cn.md](COMMERCIAL_POLICY.zh-cn.md): Simplified Chinese translation of the policy guide.
