# Signal — Simple Network Monitor frontend

A configurable operations interface for
[`simple-network-monitor`](https://github.com/terjekv/simple-network-monitor).
It keeps the room-first outage workflow from `snm-down-hosts-by-room`, while
adding live search, multi-field filters, sorting, configurable columns, CSV
export, auto-refresh, persistent room skipping, and per-host transition
history.

## Run locally

```sh
npm ci
SNM_API_URL=http://localhost:3000 npm run dev
```

The frontend is then available at `http://localhost:4444`; the monitor remains
on port `3000`. It binds to localhost only by default. The browser calls the
same-origin `/snm-api` path; the Vite server forwards those requests to
`SNM_API_URL`. The backend address therefore never needs to be reachable from
the browser, and backend CORS is not required.

The app starts in demo mode unless `SNM_API_URL` is set. You can also switch
between demo and live data from **Configure → Monitor connection**.

```sh
cp .env.example .env.local
npm run dev
```

`SNM_API_URL` is the backend origin, without a trailing `/v1` path. It is read
only by the frontend server and is not embedded in the browser bundle.

For a production-style run, build the static assets and start the included
frontend server:

```sh
npm run build
SNM_API_URL=https://monitor.example.org npm start
```

The production server also listens on `127.0.0.1:4444` by default. Override
those values with `HOST` and `PORT` when necessary.

To override the frontend development port for one run, pass Vite's `--port`
option:

```sh
SNM_API_URL=http://localhost:3000 npm run dev -- --port 5555
```

To deliberately expose the development server on the local network:

```sh
SNM_FRONTEND_TOKEN=fake-visitor-example-token SNM_API_URL=http://localhost:3000 npm run dev -- --host 0.0.0.0
```

When accessing a remote frontend over SSH, only the frontend port needs to be
forwarded:

```sh
ssh -N -L 4444:127.0.0.1:4444 operator@example.org
```

The remote frontend server will contact its own `SNM_API_URL`, such as
`http://127.0.0.1:3000`.

The live data source uses:

- `GET /v1/inventory/hosts?limit=500` with cursors and conditional requests (legacy `/v1/hosts` fallback)
- `GET /v1/hosts/{id}/history?limit=30`

Production and Vite use the same proxy and authentication rules. Set
`SNM_API_TOKEN` together with a distinct `SNM_FRONTEND_TOKEN`; visitors enter the
frontend token in the connection dialog. The server injects only the backend
token upstream. Alternatively, forward visitors' backend tokens directly by
omitting both server tokens on a loopback listener.

Non-loopback binding requires `SNM_FRONTEND_TOKEN` or explicit
`SNM_TRUST_AUTH_PROXY=true`. The latter means an authenticated reverse proxy is
the exclusive ingress; restrict direct access to the Node listener. A stored
backend token also requires one of these visitor authentication boundaries,
even on loopback. Use HTTPS at the ingress for remote access.

Tokens entered in the dialog stay in tab memory and disappear on reload.
Preferences are saved without credentials; previously persisted tokens are
removed when settings load. Demo mode remains clearly labeled and an unavailable
bootstrap configuration presents a retry message instead of silently switching
the data source.

## Checks

```sh
npm run build
npm test
npm run lint
```

## Reliability and shared verification

Use Node 24 or later. Both proxies allow only known read-only API paths on one
fixed backend origin, reject redirects and malformed paths, bound responses to
16 MiB, and enforce a 15-second deadline and 16 concurrent upstream requests.
Client disconnects cancel upstream work. Responses include a restrictive CSP
and other browser security headers. Static files cannot escape the build tree
through a symlink. Environment files, keys, certificates, and database files
are ignored.

The browser refreshes after a request completes, pauses background-tab polling,
and backs off on errors. API pages use memory-only conditional caching. The
host table renders at most 100 rows at a time; filters and CSV export operate on
the full inventory. Selected details use the latest host record. Usage failures,
missing data, disabled collection, stale observations, and empty history have
separate presentations. Dialogs manage keyboard focus. CSV exports neutralize
spreadsheet formula prefixes.

Run both repositories with `bash ../simple-network-monitor/scripts/check-projects.sh .`
from this checkout after installing Chromium with `npx playwright install chromium`.
This runs locked builds, tests, lint, audits, and the real backend/proxy/browser
fixture. `npm test` includes shared proxy attack tests and live-shaped component
fixtures. `scripts/check-pair.mjs` records desktop/mobile screenshots and local
1/10/50-viewer measurements in ignored `test-results/`.

CI runs npm tests, lint (including ESM), build, audit, workflow lint, and CodeQL.
Dependabot covers npm and Actions. Set `SNM_BACKEND_REF` to the full SHA of the
coordinated backend commit to enable combined checks on CI and weekly runs;
`SNM_BACKEND_REPOSITORY` optionally selects a different owner/repository.
The backend's corresponding `SNM_FRONTEND_REF` pins this repository's commit.
These variables deliberately have no moving-branch default. Publish the two
commits first, then configure the revision pair and require the resulting jobs.
