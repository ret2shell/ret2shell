# ![ret2shell](./arts/logo-full.svg)

`ret2shell` is a feature-riches CTF challenge platform.

## Requirements

MSRV `1.77.2`+, solidjs `1.8`+.

## Developments

### Install Rust

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
# Or use your package managers
```

Then use `rustup` to install the latest stable toolchain.

```bash
rustup install stable
```

You are done for backend development.

### Install Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_21.x | sudo -E bash -
# Or use your package managers

# Then install pnpm
sudo npm install -g pnpm
```

### Setup frontend development

```bash
cd web && pnpm install
```

### Generate temporary CA & license

```bash
cargo run --bin r2s-license -- init -p config
cargo run --bin r2s-license -- new --ca ./config/priv.bin --path ./config/ --issuer Developer --website localhost --level enterprise --date 2077-01-01
```

### Setup localhost nginx proxy

see [nginx.dev.conf](deploy/nginx.dev.conf), you could place it into your nginx config folder.

### Launch frontend development server

```bash
cd web && pnpm dev --host
```

### Launch backend server

```bash
cargo run --bin r2s-server
```

And you are done!

## Publish

WIP...
