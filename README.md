<div align="center">
  <a href="https://ret.sh.cn/">
    <img src="./arts/logo-full.svg" alt="Ret2Shell" style="width: 100%" />
  </a>
  <p><em>A feature-riches CTF challenge platform</em></p>

[![MSRV 1.83.0+](https://img.shields.io/badge/MSRV-1.83.0+-blue)](https://releases.rs/docs/1.83.0/)
[![Solid.js 1.9+](https://img.shields.io/badge/Solid.js-1.9+-orange)](https://www.solidjs.com/)

</div>

## Development

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

#### Generate license

Ret2Shell server binary has public key `pub.bin` (in [config/](config/)) integrated. It will check the `license` file (in [config/](config/)) which is signed by the paired private key, at the startup.

To generate a new CA with `priv.bin` and `pub.bin`, please run:

```bash
cargo run --bin r2s-license -- init -p config
```

Then you could generate a new license file with the CA:

```bash
cargo run --bin r2s-license -- new --ca ./config/priv.bin --path ./config/ --issuer Developer --website localhost --level enterprise --date 2077-01-01
```

Change `--issuer` to your organization name, `--website` to your domain, and `--date` to the expiration date.

#### Setup frontend

Frontend files are located in [web/](web/) directory. Enter the directory or add `--prefix=web` option after `pnpm` command.

Setup frontend dependencies:

```bash
pnpm install
```

#### Setup other services

See [deploy/nginx-http.dev.conf](deploy/nginx-http.dev.conf). You could put it into your nginx configuration directory like `/etc/nginx/sites-enabled/`.

You may need other services like database, redis to be configured, please refer to [deploy/docker-compose.dev.yml](deploy/docker-compose.dev.yml).

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

### Backend

Run the following command to start the backend server:

```bash
cargo run --bin r2s-server
```

## Build

Make sure you have installed the toolchains.

To build frontend files:

```bash
pnpm build
```

The built files will be produced in `web/dist`.

To build backend server binary:

```bash
cargo build --release --bin r2s-server
```

The built binary will be produced in `target/release/`.

## License

Copyright (c) Ret2Shell Team. All rights reserved.

Please refer to [LICENSE](LICENSE) for more information.
