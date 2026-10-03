// Real backend, production proxy and Chromium; all inventory probes are disabled.
import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { once } from 'node:events'
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import os from 'node:os'
import { DatabaseSync } from 'node:sqlite'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from 'playwright'
import { createFrontendServer } from '../server.mjs'

const binary = process.env.SNM_BACKEND_BIN
assert.ok(binary, 'Set SNM_BACKEND_BIN to the backend executable')
const backendVersion = execFileSync(binary, ['--version'], {
  encoding: 'utf8',
}).trim()
const fixture = await mkdtemp(path.join(os.tmpdir(), 'snm-pair-'))
const output = path.resolve('test-results')
await mkdir(output, { recursive: true })
const reserve = net.createServer()
reserve.listen(0, '127.0.0.1')
await once(reserve, 'listening')
const port = reserve.address().port
await new Promise((resolve) => reserve.close(resolve))
const backendOrigin = `http://127.0.0.1:${port}`
const database = path.join(fixture, 'state.db')
const inventory = Array.from(
  { length: Number(process.env.SNM_TEST_HOSTS || 501) },
  (_, index) =>
    ` {id="host-${String(index).padStart(5, '0')}",name="host-${index}.example",address="192.0.2.1",groups=["example"],metadata={room="Room example"},modules={tcp={checks=[{id="web",port=443}]}}}`,
)
inventory.push(
  ' {id="page",name="page.example",address="192.0.2.2",groups=["example"],metadata={room="Room example"}}',
)
await writeFile(
  path.join(fixture, 'monitor.toml'),
  `bind="127.0.0.1:${port}"\napi_workers=2\ndatabase_path=${JSON.stringify(database)}\napi_token="fake-backend-token"\nhosts=[\n${inventory.join(',\n')}\n]\n[modules.icmp]\nenabled=false\n[modules.usage]\nenabled=false\n[modules.tcp]\nenabled=false\n`,
)
const backend = spawn(
  binary,
  ['--config', path.join(fixture, 'monitor.toml')],
  { stdio: ['ignore', 'pipe', 'pipe'] },
)
let log = ''
backend.stdout.on('data', (chunk) => {
  log += chunk
})
backend.stderr.on('data', (chunk) => {
  log += chunk
})
let frontend, browser, db
try {
  let ready = false
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${backendOrigin}/healthz`)).ok) {
        ready = true
        break
      }
    } catch {
      /* Wait for local startup. */
    }
    if (backend.exitCode !== null) throw new Error(log)
    await delay(25)
  }
  assert.ok(ready, log)
  db = new DatabaseSync(database)
  const now = new Date().toISOString()
  db.prepare(
    'INSERT INTO latest_status(host_id,status,last_checked_at,last_change_at,consecutive_successes,consecutive_failures,last_error) VALUES(?,?,?,?,?,?,?)',
  ).run('host-00000', 'down', now, now, 0, 3, 'fake timeout')
  db.prepare(
    'INSERT INTO latest_usage(host_id,collected_at,console_users,remote_users,status,error) VALUES(?,?,?,?,?,?)',
  ).run('host-00000', now, null, null, 'error', 'fake collection error')
  frontend = createFrontendServer({
    apiUrl: backendOrigin,
    apiToken: 'fake-backend-token',
    accessToken: 'fake-visitor-token',
  })
  frontend.listen(0, '127.0.0.1')
  await once(frontend, 'listening')
  const origin = `http://127.0.0.1:${frontend.address().port}`
  assert.equal((await fetch(`${backendOrigin}/v1/hosts`)).status, 401)
  assert.equal((await fetch(`${origin}/snm-api/v1/hosts`)).status, 401)
  const headers = { Authorization: 'Bearer fake-visitor-token' }
  const pageHost = await fetch(`${origin}/snm-api/v1/hosts/page`, { headers })
  assert.equal(pageHost.status, 200)
  assert.equal((await pageHost.json()).id, 'page')
  assert.equal(
    (
      await fetch(
        `${origin}/snm-api/v1/hosts?usage.no_users_for=1000000years`,
        { headers },
      )
    ).status,
    400,
  )
  const badFilter = await fetch(
    `${origin}/snm-api/v1/hosts?unsupported=value`,
    { headers },
  )
  assert.equal(badFilter.status, 400)
  assert.equal(typeof (await badFilter.json()).error, 'string')
  const first = await fetch(`${origin}/snm-api/v1/inventory/hosts?limit=100`, {
    headers,
  })
  assert.equal(first.status, 200)
  const etag = first.headers.get('etag')
  assert.ok(etag)
  const page = await first.json()
  assert.equal(page.hosts.length, 100)
  assert.deepEqual(page.hosts[0].tcp, [{
    id: 'web', port: 443, enabled: false, stale: true, observation: null,
  }])
  assert.ok(page.next_after)
  assert.equal(
    (
      await fetch(`${origin}/snm-api/v1/inventory/hosts?limit=100`, {
        headers: { ...headers, 'If-None-Match': etag },
      })
    ).status,
    304,
  )
  browser = await chromium.launch({ headless: true })
  const tab = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  // External fonts are cosmetic and are kept out of the deterministic test.
  await tab.route('https://fonts.**/*', (route) =>
    route.fulfill({ status: 200, body: '' }),
  )
  const errors = []
  tab.on('pageerror', (error) => errors.push(error.message))
  await tab.goto(origin)
  await tab.getByRole('button', { name: 'Settings', exact: true }).click()
  await tab
    .getByLabel('Access token', { exact: true })
    .fill('fake-visitor-token')
  await tab.getByRole('button', { name: 'Save & connect' }).click()
  await tab
    .getByPlaceholder('Search hosts, IPs, rooms or groups')
    .fill('host-0.example')
  await tab.getByText('host-0.example', { exact: true }).waitFor()
  assert.ok((await tab.locator('.host-row').count()) <= 100)
  await tab.getByText('host-0.example', { exact: true }).click()
  await tab.getByRole('dialog').waitFor()
  assert.ok(
    await tab
      .getByRole('dialog')
      .evaluate((dialog) => dialog.contains(document.activeElement)),
  )
  assert.equal(
    await tab
      .getByText('Active users', { exact: true })
      .locator('..')
      .locator('strong')
      .innerText(),
    'Disabled',
  )
  await tab.getByText('No status changes have been recorded.').waitFor()
  await tab.keyboard.press('Escape')
  await tab.getByRole('button', { name: /Monitored hosts/ }).click()
  await tab
    .getByPlaceholder('Search hosts, IPs, rooms or groups')
    .fill('host-0.example')
  assert.equal(await tab.locator('.host-row').count(), 1)
  db.prepare(
    "UPDATE latest_status SET status='up',consecutive_successes=1,consecutive_failures=0,last_error=NULL WHERE host_id='host-00000'",
  ).run()
  const refreshed = tab.waitForResponse((response) =>
    response.url().includes('/v1/inventory/hosts?'),
  )
  await tab.getByRole('button', { name: 'Refresh', exact: true }).click()
  await refreshed
  await tab.getByText('host-0.example', { exact: true }).click()
  await tab.getByText(/Last known: Online/).waitFor()
  await tab.keyboard.press('Escape')
  assert.ok(
    !(
      await tab.evaluate(() => localStorage.getItem('snm.connection'))
    ).includes('fake-visitor-token'),
  )
  await tab.screenshot({
    path: path.join(output, 'pair-desktop.png'),
    fullPage: true,
  })
  await tab.setViewportSize({ width: 390, height: 844 })
  await tab.waitForFunction(
    () => document.querySelector('.sidebar').getBoundingClientRect().right <= 0,
  )
  assert.ok(
    await tab.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
    'Mobile document overflows viewport',
  )
  await tab.screenshot({
    path: path.join(output, 'pair-mobile.png'),
    fullPage: true,
  })
  assert.deepEqual(errors, [])
  const benchmark = []
  for (const viewers of [1, 10, 50]) {
    const results = await Promise.all(
      Array.from({ length: viewers }, async () => {
        const start = performance.now()
        const response = await fetch(
          `${origin}/snm-api/v1/inventory/hosts?limit=100`,
          { headers },
        )
        const bytes = (await response.arrayBuffer()).byteLength
        assert.ok([200, 503].includes(response.status))
        return { ms: performance.now() - start, bytes, status: response.status }
      }),
    )
    results.sort((a, b) => a.ms - b.ms)
    benchmark.push({
      viewers,
      p50: results[Math.floor(results.length * 0.5)].ms,
      p95: results[
        Math.min(results.length - 1, Math.floor(results.length * 0.95))
      ].ms,
      busy: results.filter((result) => result.status === 503).length,
      bytes: results.reduce((sum, result) => sum + result.bytes, 0),
    })
  }
  let frontendRevision = 'uncommitted checkout'
  try {
    frontendRevision = execFileSync('git', ['rev-parse', 'HEAD'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    /* New frontend checkout may not have a commit yet. */
  }
  const evidence = {
    backendBinary: binary,
    backendVersion,
    databaseSchema: db.prepare('PRAGMA user_version').get().user_version,
    frontendRevision,
    hosts: inventory.length,
    benchmark,
    pageErrors: errors,
  }
  await writeFile(
    path.join(output, 'pair-results.json'),
    JSON.stringify(evidence, null, 2) + '\n',
  )
  console.log(JSON.stringify(evidence, null, 2))
} finally {
  db?.close()
  await browser?.close()
  if (frontend) {
    frontend.closeAllConnections()
    await new Promise((resolve) => frontend.close(resolve))
  }
  backend.kill('SIGTERM')
  await Promise.race([
    once(backend, 'exit'),
    delay(3000).then(() => backend.kill('SIGKILL')),
  ])
  await rm(fixture, { recursive: true, force: true })
}
