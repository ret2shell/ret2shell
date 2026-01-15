# ret2shell Helm chart

This chart lives in `deploy/helm/ret2shell` and bundles the core ret2shell service with optional dependencies:

- PostgreSQL
- Valkey
- NATS
- VictoriaLogs
- Docker registry (distribution)

## Usage

```bash
helm dependency update deploy/helm/ret2shell
# make sure a valid license is provided
helm install ret2shell deploy/helm/ret2shell \
  --set-file license.value=/path/to/license
```

### Common toggles

All bundled services can be disabled to use external endpoints:

```bash
--set postgresql.enabled=false --set database.host=db.example.com
--set valkey.enabled=false --set cache.url="redis://cache.example.com:6379"
--set nats.enabled=false --set queue.host=nats.example.com
--set victoriaLogs.enabled=false --set logging.victoriaUrl=http://logs.example.com
--set dockerRegistry.enabled=false --set cluster.registry.server=registry.example.com
```

> **Note:** Provide your own values for `auth.signingKey`, `database.password`, and `postgresql.auth.password` before any production deployment.

By default the chart mounts:

- `/etc/ret2shell/config.toml` from the rendered ConfigMap
- `/etc/ret2shell/license` from the provided secret
- `/etc/ret2shell/sensitive_word_list.txt` from the rendered ConfigMap
- `/var/lib/ret2shell` as a persistent volume (disable with `persistence.enabled=false`)
