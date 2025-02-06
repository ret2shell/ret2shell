# Configuration Files

This directory stores configuration of ret2shell.

These are default given configuration files, with paths to fit volumes at [docker-compose.yml](../docker-compose.yml).

You can still override them to fit your needs, especially for **KEYs** and those which are not related to paths.

> [!CAUTION]
>
> `kubeconfig.yaml` is the configuration file for k8s cluster, which launches all challenges.
>
> Note that `kubeconfig.yaml` is not given but configured at [config.toml](config.toml), in this directory. You can take one of following suggestions:
>
> - Put your `kubeconfig.yaml` in this directory. Note that if you enable `cluster.registry`, `cluster.registry.external` should be correctly configured to ensure that the k8s cluster can visit the registry.
> - Add a volume in [docker-compose.yml](../docker-compose.yml), mouting to `/etc/ret2shell/kubeconfig.yaml` according to statement in [config.toml](config.toml).

Examples could be found in [/config/](../../../config/) at the root of the repository.
