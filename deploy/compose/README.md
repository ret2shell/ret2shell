# Docker Compose Deployment

Deployment example using [Docker Compose](https://docs.docker.com/compose/).

> [!NOTE]
>
> The provided [docker-compose.yml](docker-compose.yml) file is fully configured with all services required to run the application.
>
> If you want to start server binary independently, you can comment out the `platform` and `nginx` service in the compose file and expose ports under other services as the comments suggest.

Directory [platform/](platform/) contains `config.toml` and `license` (mount to `/etc/ret2shell/` as state at [crates/config/src/lib.rs](../../crates//config/src/lib.rs)), for `platform` service. You need to change the configuration file (example given at [config/config.sample.toml](../../config/config.sample.toml)) to fit your compose configuration.

Directory [static/](static/) contains frontend static files (mount to `/var/www/html/`), for `nginx` service.

It's recommended to put other configuration like sensitive word list or kubernetes configuration in the [platform/](platform/) directory.
