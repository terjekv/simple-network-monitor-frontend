import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
// @vitest-environment node
import http from 'node:http'
import { afterEach, expect, it } from 'vitest'
import { createFrontendServer } from './server.mjs'
import { createApiMiddleware, validateExposure } from './proxy.mjs'

const servers = []
async function listen(server) {
  servers.push(server)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${server.address().port}`
}
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections()
          server.close(resolve)
        }),
    ),
  )
})
function request(origin, path, headers = {}, method = 'GET') {
  return new Promise((resolve, reject) => {
    const req = http.request(origin, { path, headers, method }, (response) => {
      let body = ''
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => resolve({ status: response.statusCode, body }))
    })
    req.on('error', reject)
    req.end()
  })
}
it.each([
  '/snm-api//attacker.example/v1/hosts',
  '/snm-api//[',
  '/snm-api/%2f%2fattacker.example',
  '/snm-api/../v1/hosts',
  '/snm-api/v1/hosts%ZZ',
  '/snm-api/\\attacker.example',
  '//attacker.example/path',
])('rejects unsafe raw path %s before forwarding a token', async (path) => {
  let calls = 0
  const backend = await listen(
    http.createServer((_, response) => {
      calls++
      response.end('[]')
    }),
  )
  const origin = await listen(
    createFrontendServer({
      apiUrl: backend,
      apiToken: 'fake-backend',
      accessToken: 'fake-visitor',
    }),
  )
  expect(
    (await request(origin, path, { Authorization: 'Bearer fake-visitor' }))
      .status,
  ).toBe(400)
  expect(calls).toBe(0)
  expect((await request(origin, '/snm-api/config')).status).toBe(200)
})
it.each([
  [undefined, '/snm-api/v1/hosts'],
  ['Bearer wrong', '/snm-api/v1/hosts'],
  [undefined, '/snm-api/v1/inventory/hosts?limit=500'],
  ['Bearer wrong', '/snm-api/v1/inventory/hosts?limit=500'],
])(
  'denies an unauthenticated visitor (%s) for %s',
  async (authorization, apiPath) => {
    let calls = 0
    const backend = await listen(
      http.createServer((_, response) => {
        calls++
        response.end('[]')
      }),
    )
    const origin = await listen(
      createFrontendServer({
        apiUrl: backend,
        apiToken: 'fake-backend',
        accessToken: 'fake-visitor',
      }),
    )
    expect(
      (
        await request(
          origin,
          apiPath,
          authorization ? { Authorization: authorization } : {},
        )
      ).status,
    ).toBe(401)
    expect(calls).toBe(0)
  },
)
it('requires an explicit visitor authentication boundary for stored backend credentials', () => {
  expect(() =>
    createApiMiddleware({ apiUrl: 'http://127.0.0.1:8080', apiToken: 'fake' }),
  ).toThrow(/requires/)
  expect(() => validateExposure('0.0.0.0')).toThrow(/requires/)
  expect(() => validateExposure('::', { accessToken: 'fake' })).not.toThrow()
})
it('refuses upstream redirects without contacting their destination', async () => {
  let calls = 0
  const attacker = await listen(
    http.createServer((_, response) => {
      calls++
      response.end('[]')
    }),
  )
  const backend = await listen(
    http.createServer((_, response) => {
      response.writeHead(302, { Location: attacker })
      response.end()
    }),
  )
  const origin = await listen(createFrontendServer({ apiUrl: backend }))
  expect((await request(origin, '/snm-api/v1/hosts')).status).toBe(502)
  expect(calls).toBe(0)
})
it('bounds upstream response size', async () => {
  const backend = await listen(
    http.createServer((_, response) => response.end('x'.repeat(1024))),
  )
  const origin = await listen(
    createFrontendServer({ apiUrl: backend, maxResponseBytes: 16 }),
  )
  expect((await request(origin, '/snm-api/v1/hosts')).status).toBe(502)
})
it('applies an upstream deadline', async () => {
  const backend = await listen(http.createServer(() => {}))
  const origin = await listen(
    createFrontendServer({ apiUrl: backend, timeoutMs: 40 }),
  )
  expect((await request(origin, '/snm-api/v1/hosts')).status).toBe(504)
})
it('rejects excess requests before opening another upstream request', async () => {
  let arrived
  const started = new Promise((resolve) => {
    arrived = resolve
  })
  const backend = await listen(http.createServer(() => arrived()))
  const origin = await listen(
    createFrontendServer({ apiUrl: backend, timeoutMs: 150, maxConcurrent: 1 }),
  )
  const first = request(origin, '/snm-api/v1/hosts')
  await started
  expect((await request(origin, '/snm-api/v1/hosts')).status).toBe(503)
  expect((await first).status).toBe(504)
})
it('aborts upstream work when the browser disconnects', async () => {
  let arrived, closed
  const started = new Promise((resolve) => {
    arrived = resolve
  })
  const disconnected = new Promise((resolve) => {
    closed = resolve
  })
  const backend = await listen(
    http.createServer((request) => {
      request.on('close', closed)
      arrived()
    }),
  )
  const origin = await listen(
    createFrontendServer({ apiUrl: backend, timeoutMs: 10_000 }),
  )
  const client = http.get(`${origin}/snm-api/v1/hosts`)
  client.on('error', () => {})
  await started
  client.destroy()
  await disconnected
})

it('rejects index symlinks on both direct and SPA fallback requests', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'snm-static-test-'))
  const outside = `${root}-outside.txt`
  try {
    await writeFile(outside, 'fake-private-content')
    await symlink(outside, path.join(root, 'index.html'))
    const origin = await listen(
      createFrontendServer({ apiUrl: '', distDirectory: root }),
    )
    for (const pathname of ['/', '/unknown-page']) {
      const response = await request(origin, pathname, { Accept: 'text/html' })
      expect(response.status).toBe(403)
      expect(response.body).not.toContain('fake-private-content')
    }
  } finally {
    await rm(root, { recursive: true, force: true })
    await rm(outside, { force: true })
  }
})
