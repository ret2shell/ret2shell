# Kubernetes Deployment

This directory replaces `deploy/k8s-deprecated/` for small and medium Kubernetes clusters.

The old split deployment used these pieces:

- `0-init.yaml`
- `1-volumes.yaml`
- `2-cache/`
- `3-database/`
- `4-queue/`
- `5-registry/`
- `6-logs/`
- `7-platform.yaml`

This directory keeps the same overall topology, but installs everything through the unified `deploy/helm/ret2shell` chart.

What changes with the new flow:

- The platform image now comes from `ghcr.io/ret2shell/ret2shell`
- The platform, PostgreSQL, Valkey, NATS, internal registry, and VictoriaLogs are installed by one Helm release
- `config.toml` and `blocked.txt` are generated from Helm values instead of manual `ConfigMap` creation
- The challenge namespace is created by the chart
- The internal registry is still available for challenge images, but the platform itself no longer needs a manually built local image

## Files

- `storage-local.yaml`: local `StorageClass` and `PersistentVolume` objects for the old single-node style deployment
- `storage-local-ha.example.yaml`: extra local PV examples for the Valkey and NATS replica overlays
- `values-common.yaml`: shared chart values for the internal dependency stack
- `values-nodeport.yaml`: NodePort exposure, closest to the old `7-platform.yaml` plus external nginx layout
- `values-ingress.yaml`: ingress exposure for clusters with an ingress controller
- `values.private.example.yaml`: copy to `values.private.yaml` and fill in release tag and secrets
- `values-ha.example.yaml`: optional overlay for NATS clustering, registry horizontal scaling, and ServiceMonitor-based metrics

The default local PV paths intentionally stay under `/srv/ret2shell/backend/storage` so an existing `deploy/k8s-deprecated` installation can reuse the same on-node data directories without moving them first.

## Quick Start

1. Edit `deploy/k8s/storage-local.yaml` and replace:
   - `ret2shell-node-master` with your node hostname from `kubectl get nodes`
   - each local path with the directories you want to use on that node
2. Apply the storage bootstrap:

   ```bash
   kubectl apply -f deploy/k8s/storage-local.yaml
   ```

   If you enable replicated Valkey or clustered NATS on local disks, also apply:

   ```bash
   kubectl apply -f deploy/k8s/storage-local-ha.example.yaml
   ```

3. Copy the private values template and fill in real secrets:

   ```bash
   cp deploy/k8s/values.private.example.yaml deploy/k8s/values.private.yaml
   ```

4. Choose one public entrypoint model and edit the addresses inside it:
   - `deploy/k8s/values-nodeport.yaml`
   - `deploy/k8s/values-ingress.yaml`

5. Install from a GitHub release asset. This is the recommended path because the packaged chart is already rewritten to the release version:

   ```bash
   R2S_VERSION=3.10.9
   helm upgrade --install ret2shell \
     "https://github.com/ret2shell/ret2shell/releases/download/${R2S_VERSION}/ret2shell-${R2S_VERSION}.tgz" \
     -n ret2shell-platform \
     --create-namespace \
     -f deploy/k8s/values-common.yaml \
     -f deploy/k8s/values-nodeport.yaml \
     -f deploy/k8s/values.private.yaml
   ```

6. If you use ingress instead of NodePort, swap `deploy/k8s/values-nodeport.yaml` for `deploy/k8s/values-ingress.yaml`.

7. If you want the richer observability and multi-replica knobs, add `deploy/k8s/values-ha.example.yaml` as another `-f` layer after you review it.

## Notes

- Keep `platform.image.tag` in `deploy/k8s/values.private.yaml` aligned with the chart release you install.
- If you install from the source chart at `deploy/helm/ret2shell`, you still need the same values layering, but the image tag is taken only from your values files.
- The chart uses `ghcr.io/ret2shell/ret2shell` for the platform image. The integrated registry is only for challenge images and cluster-side image distribution.
- If you already manage `config.toml` or `blocked.txt` yourself, set `platform.config.existingSecret` and `platform.blocked.existingConfigMap` instead of using generated values.
- If you want a default challenge scheduling label, label nodes first and then set `platform.config.cluster.nodeSelector`.
- `valkey.architecture=replication` uses StatefulSet pod `0` as the primary and the remaining pods as replicas.
- `nats.replicaCount` enables NATS cluster routing in the bundled chart.
- `registry.replicaCount > 1` only makes sense with shared storage, not the default local PV layout from `storage-local.yaml`.
- `storage-local-ha.example.yaml` keeps the old `/srv/ret2shell/backend/storage` root and only adds extra PVs for cache and queue replicas.

Example node labeling:

```bash
kubectl label nodes ret2shell-worker-1 ret.sh.cn/workload=challenge
```

## Update

Upgrade by changing the version and rerunning `helm upgrade --install`:

```bash
R2S_VERSION=3.10.9
helm upgrade --install ret2shell \
  "https://github.com/ret2shell/ret2shell/releases/download/${R2S_VERSION}/ret2shell-${R2S_VERSION}.tgz" \
  -n ret2shell-platform \
  -f deploy/k8s/values-common.yaml \
  -f deploy/k8s/values-nodeport.yaml \
  -f deploy/k8s/values.private.yaml
```

## Migration Map

| Deprecated layout | New layout                                                           |
| ----------------- | -------------------------------------------------------------------- |
| `0-init.yaml`     | `--create-namespace` plus chart-managed challenge namespace and RBAC |
| `1-volumes.yaml`  | `deploy/k8s/storage-local.yaml`                                      |
| `2-cache/`        | `valkey.*` values in the unified chart                               |
| `3-database/`     | `postgresql.*` values in the unified chart                           |
| `4-queue/`        | `nats.*` values in the unified chart                                 |
| `5-registry/`     | `registry.*` values in the unified chart                             |
| `6-logs/`         | `victoriaLogs.*` values in the unified chart                         |
| `7-platform.yaml` | `platform.*` values in the unified chart                             |
