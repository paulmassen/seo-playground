# Cloudron package

Files for running SEO Playground as a [Cloudron](https://cloudron.io) community app. Nothing here is used by the
regular `Dockerfile`, `docker-compose*.yml` or the GHCR release image.

| File | Purpose |
| --- | --- |
| `../CloudronManifest.json` | App metadata, port 8000, `localstorage` + `proxyAuth` addons |
| `../Dockerfile.cloudron` | Builds the Next.js standalone bundle on `cloudron/node-base` |
| `start.sh` | Fixes permissions, creates the worker secret, drops privileges with `gosu` |
| `launcher.mjs` | Runs the web server and the Geo-grid worker in one container |

How it works:

- **Data**: `DB_PATH=/app/data/seo-playground.db`; the per-project databases and the auth/secret files sit next to it, so
  everything is covered by Cloudron backups.
- **Access control**: the `proxyAuth` addon puts Cloudron's login in front of the app, so the app's own login
  (`AUTH_ENABLED`) stays off. It cannot be added to an existing install; reinstall to enable it.
- **Updates**: the in-app "new version" banner is disabled (`UPDATE_CHECK_DISABLED=true`); Cloudron handles updates.
- **Read-only filesystem**: `.next/cache` is a symlink to `/run/next-cache`.

## Try it

```sh
sudo npm install -g cloudron
cloudron login my.example.com
cloudron install          # builds on the server from this directory
cloudron logs -f
cloudron update           # after changes
```

Run these from a clean checkout: `cloudron install` uploads the directory, and `.dockerignore` only excludes some SQLite files.

## Publish as a community app

The image must be in a registry (on-server builds cannot be published).

```sh
cloudron builder login              # needs the Container registry app, or push to GHCR yourself
cloudron builder build
cloudron versions init              # creates CloudronVersions.json
cloudron versions add --last-build
```

Host `CloudronVersions.json` at a public URL (for example the raw file on GitHub) and share it: users add that URL under
**Community apps** in their Cloudron dashboard, or run `cloudron install --versions-url <url>`.

For each new release, bump `version` in `CloudronManifest.json`, add a section to `cloudron/CHANGELOG`, rebuild, then run
`cloudron versions add` again.
