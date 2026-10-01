# Repository guidance

Keep this frontend reusable and safe to publish. Use reserved example addresses,
`.example` hostnames and fake tokens. Never commit operational environment files,
host inventories, databases, keys or certificates; `.env.example` is safe guidance.

Production and Vite must use the shared `proxy.mjs` implementation. Treat origin
validation, visitor authentication, server-side credentials, request cancellation,
response limits, and static-file boundaries as security-sensitive. Add focused
regressions when changing them. Keep loopback defaults and never enable a stored
backend credential without a visitor authentication boundary.

Run `npm ci`, `npm run lint`, `npm test`, `npm run build`, and
`npm audit --audit-level=low` before considering a behavior change complete. Run
`actionlint` for workflow changes. Preserve CodeQL, dependency checks, minimal
workflow permissions, and npm/Actions Dependabot coverage. Use supported major
Action references and full commit SHAs for counterpart compatibility checkouts.

Use `bash ../simple-network-monitor/scripts/check-projects.sh .` for the complete
backend/frontend workflow. Browser tests must use fake inventory and disabled
network probes. Keep tests focused on observable behavior and use narrow mocks.

Keep data validation and pure selectors in `src/model.ts` and `src/api.ts`, view
components in their own files, and focus/polling behavior in focused hooks where
useful. Preserve explicit distinctions between stale, disabled, missing, failed
and empty data. Tokens entered in the UI stay in memory, never local storage.
Update README and `.env.example` whenever public behavior changes.
