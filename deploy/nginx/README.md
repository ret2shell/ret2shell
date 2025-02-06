# Nginx deployment

You need to prepare frontend static files and backend server before deploying.

## Quick start

Configuare `upstream`, and change `root` directory under `location /`, in order to fit your environment.

Put [ret2shell.conf](ret2shell.conf) into `/etc/nginx/sites-available/`, and link it to `/etc/nginx/sites-enabled/`:

```sh
ln -s /etc/nginx/sites-available/ret2shell.conf /etc/nginx/sites-enabled/
```

Then restart the nginx service.
