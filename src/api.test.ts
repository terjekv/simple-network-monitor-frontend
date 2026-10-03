import { afterEach, expect, it, vi } from 'vitest'
import { fetchHistory, fetchHosts } from './api'
const host = {
  id: 'r1',
  name: 'router.example',
  address: '192.0.2.1',
  groups: ['example'],
  metadata: {},
  status: 'unknown',
  last_checked_at: null,
  last_change_at: null,
  last_error: null,
  consecutive_failures: 0,
  consecutive_successes: 0,
  latency_ms: null,
  usage: null,
}
afterEach(() => vi.unstubAllGlobals())
it('accepts v0.0.3 TCP observations without changing ICMP or usage state', async () => {
  const currentHost = {
    ...host,
    icmp_enabled: false,
    usage_enabled: false,
    icmp_stale: true,
    usage_stale: true,
    tcp: [{
      id: 'web',
      port: 443,
      enabled: true,
      stale: false,
      observation: {
        observed_at: '2026-10-03T00:00:00Z',
        success: true,
        duration_seconds: 0.01,
        error: null,
      },
    }],
  }
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
    Response.json({ hosts: [currentHost], next_after: null }),
  ))
  const hosts = await fetchHosts({
    token: 'fake-v003-test',
    demoMode: false,
    refreshSeconds: 30,
  })
  expect(hosts).toEqual([currentHost])
  expect(hosts[0].status).toBe('unknown')
  expect(hosts[0].usage).toBeNull()
})
it('follows page cursors and reuses unchanged pages with conditional requests', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(
      Response.json(
        { hosts: [host], next_after: 'r1' },
        { headers: { etag: '"one"' } },
      ),
    )
    .mockResolvedValueOnce(
      Response.json(
        { hosts: [{ ...host, id: 'r2' }], next_after: null },
        { headers: { etag: '"two"' } },
      ),
    )
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
    .mockResolvedValueOnce(new Response(null, { status: 304 }))
  vi.stubGlobal('fetch', fetch)
  const settings = {
    token: 'fake-pages-test',
    demoMode: false,
    refreshSeconds: 30,
  }
  expect(await fetchHosts(settings)).toHaveLength(2)
  expect(await fetchHosts(settings)).toHaveLength(2)
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/snm-api/v1/inventory/hosts?limit=500',
    '/snm-api/v1/inventory/hosts?limit=500&after=r1',
    '/snm-api/v1/inventory/hosts?limit=500',
    '/snm-api/v1/inventory/hosts?limit=500&after=r1',
  ])
  expect(fetch.mock.calls[2][1].headers['If-None-Match']).toBe('"one"')
  expect(fetch.mock.calls[3][1].headers['If-None-Match']).toBe('"two"')
})
it('falls back to the legacy list when inventory paging is unavailable', async () => {
  const fetch = vi
    .fn()
    .mockResolvedValueOnce(new Response(null, { status: 404 }))
    .mockResolvedValueOnce(Response.json([{ ...host, id: 'page' }]))
  vi.stubGlobal('fetch', fetch)
  const hosts = await fetchHosts({
    token: 'fake-legacy-test',
    demoMode: false,
    refreshSeconds: 30,
  })
  expect(hosts.map(({ id }) => id)).toEqual(['page'])
  expect(fetch.mock.calls.map(([url]) => url)).toEqual([
    '/snm-api/v1/inventory/hosts?limit=500',
    '/snm-api/v1/hosts',
  ])
  expect(fetch.mock.calls[1][1].headers.Authorization).toBe(
    'Bearer fake-legacy-test',
  )
})
it.each([401, 403, 503])('preserves paging errors (%i) without a legacy fallback', async (status) => {
  const fetch = vi.fn().mockResolvedValue(
    Response.json({ error: 'paging unavailable' }, { status }),
  )
  vi.stubGlobal('fetch', fetch)
  await expect(
    fetchHosts({
      token: `fake-paging-error-${status}`,
      demoMode: false,
      refreshSeconds: 30,
    }),
  ).rejects.toThrow('paging unavailable')
  expect(fetch).toHaveBeenCalledTimes(1)
})
it('rejects a repeated cursor instead of polling forever', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockImplementation(() =>
        Promise.resolve(Response.json({ hosts: [host], next_after: 'r1' })),
      ),
  )
  await expect(
    fetchHosts({
      token: 'fake-cursor-test',
      demoMode: false,
      refreshSeconds: 30,
    }),
  ).rejects.toThrow(/repeated/)
})
it('rejects malformed live host data', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ hosts: [{ ...host, groups: null }], next_after: null }),
      ),
  )
  await expect(
    fetchHosts({
      token: 'fake-shape-test',
      demoMode: false,
      refreshSeconds: 30,
    }),
  ).rejects.toThrow(/invalid host/)
})
it('preserves real API history errors', async () => {
  vi.stubGlobal(
    'fetch',
    vi
      .fn()
      .mockResolvedValue(
        Response.json({ error: 'storage unavailable' }, { status: 503 }),
      ),
  )
  await expect(
    fetchHistory({ token: '', demoMode: false, refreshSeconds: 30 }, 'r1'),
  ).rejects.toThrow('storage unavailable')
})
it('honors cancellation even for demo data', async () => {
  const controller = new AbortController()
  controller.abort()
  await expect(
    fetchHosts(
      { token: '', demoMode: true, refreshSeconds: 30 },
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: 'AbortError' })
})
