# CHANGELOG

## 3.5.8

### Breaking Changes

```diff toml
# config.toml

[server]
-api_burst_limit        = 32
-api_burst_restore_rate = 500             # in milliseconds
...

[server.rate_limit]
+burst_limit        = 32
+burst_restore_rate = 500             # in milliseconds
```

Move rate limit config to independent section. When `rate_limit` section is missing, the rate limit feature for server will be disabled.

## 3.5.7

### Common Developing Changes

- using better default email html template in backend fallback #91 .
- add menu button for admin page on mobile view #106 .
- se clsx to construct component classes.
- add time info on chat message.

### User Changes

- increase dynamic score limit, now the platform supports 0-1500 score ranges with max to 50 decays.

## 3.5.6

### Breaking Changes

- Event API will always report challenge state changes.

### Fixed

- setup nats consumer inactive state, which may fix email worker stuck issue.
- delete pods when creating corresponding services failed, partially fixes #111 .
- fixes cluster maintain worker, add server panic event to Event API.

### Common Developing Changes

- migrate to tailwindcss v4.

### User Changes

- the service port in challenge environment configuration of challenge have state check now.

## 3.5.5

### Fixed

- \[SECURITY\] traffic API through wsrx will check service ports before proxing.

### User Changes

- support ImagePullSecret in challenge environment configuration.

## 3.5.4

### Breaking Changes

- use generic cell rate algorithm for rate limit.

```diff toml
# config.toml

[server]
-api_rate_limit = 0
+api_burst_limit        = 32
+api_burst_restore_rate = 500             # in milliseconds
```
