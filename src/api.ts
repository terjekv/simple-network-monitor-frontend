import { demoHosts, demoTransitions } from './demo'
import type { ConnectionSettings, Host, Transition } from './types'

const API_PREFIX = '/snm-api'
const headersFor = (token: string): Record<string, string> =>
  token ? { Authorization: `Bearer ${token}` } : {}
const deadline = (signal?: AbortSignal) =>
  signal
    ? AbortSignal.any([signal, AbortSignal.timeout(30_000)])
    : AbortSignal.timeout(30_000)
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const nullableString = (value: unknown) =>
  value === null || typeof value === 'string'
const status = (value: unknown) =>
  ['up', 'down', 'unknown'].includes(String(value))
const count = (value: unknown) =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function validateHosts(value: unknown): Host[] {
  if (
    !Array.isArray(value) ||
    !value.every((host: unknown) => {
      if (
        !object(host) ||
        !['id', 'name', 'address'].every(
          (key) => typeof host[key] === 'string',
        ) ||
        !Array.isArray(host.groups) ||
        !host.groups.every((group: unknown) => typeof group === 'string') ||
        !object(host.metadata) ||
        !status(host.status)
      )
        return false
      if (
        !['last_checked_at', 'last_change_at', 'last_error'].every((key) =>
          nullableString(host[key]),
        ) ||
        !count(host.consecutive_failures) ||
        !count(host.consecutive_successes)
      )
        return false
      if (
        !['icmp_enabled', 'usage_enabled', 'icmp_stale', 'usage_stale'].every(
          (key) => host[key] === undefined || typeof host[key] === 'boolean',
        )
      )
        return false
      const usage = host.usage
      return (
        usage === null ||
        (object(usage) &&
          typeof usage.collected_at === 'string' &&
          nullableString(usage.error) &&
          (usage.status === 'error' ||
            (usage.status === 'ok' &&
              count(usage.console_users) &&
              count(usage.remote_users))))
      )
    })
  )
    throw new Error('Monitor returned an invalid host response')
  return value as Host[]
}

const responseError = async (response: Response, fallback: string) => {
  try {
    const body: unknown = await response.json()
    if (object(body) && typeof body.error === 'string' && body.error.trim())
      return body.error
  } catch {
    /* Non-JSON errors use the status fallback. */
  }
  return `${fallback} (${response.status} ${response.statusText})`
}

interface Page {
  hosts: Host[]
  next_after: string | null
}
let cacheToken = ''
let pages = new Map<string, { etag: string; page: Page }>()

export async function fetchHosts(
  settings: ConnectionSettings,
  signal?: AbortSignal,
): Promise<Host[]> {
  signal?.throwIfAborted()
  if (settings.demoMode) return demoHosts
  if (cacheToken !== settings.token) {
    pages = new Map()
    cacheToken = settings.token
  }
  const cache = pages
  const bounded = deadline(signal)
  const hosts: Host[] = []
  const seen = new Set<string>()
  let after: string | null = null
  do {
    const url: string = `${API_PREFIX}/v1/inventory/hosts?limit=500${after === null ? '' : `&after=${encodeURIComponent(after)}`}`
    const cached = cache.get(url)
    const response = await fetch(url, {
      headers: {
        ...headersFor(settings.token),
        ...(cached ? { 'If-None-Match': cached.etag } : {}),
      },
      signal: bounded,
    })
    // Maintain compatibility with a backend that predates paged inventory responses.
    if (response.status === 404 && after === null) {
      const legacy = await fetch(`${API_PREFIX}/v1/hosts`, {
        headers: headersFor(settings.token),
        signal: bounded,
      })
      if (!legacy.ok)
        throw new Error(await responseError(legacy, 'Monitor request failed'))
      return validateHosts(await legacy.json())
    }
    let page: Page
    if (response.status === 304 && cached) page = cached.page
    else {
      if (!response.ok)
        throw new Error(await responseError(response, 'Monitor request failed'))
      const body: unknown = await response.json()
      if (!object(body) || !nullableString(body.next_after))
        throw new Error('Monitor returned an invalid page')
      page = {
        hosts: validateHosts(body.hosts),
        next_after: body.next_after as string | null,
      }
      const etag = response.headers.get('etag')
      if (etag) {
        cache.set(url, { etag, page })
        if (cache.size > 256) cache.delete(cache.keys().next().value!)
      }
    }
    bounded.throwIfAborted()
    if (
      page.next_after !== null &&
      (page.next_after === after || seen.has(page.next_after))
    )
      throw new Error('Monitor returned a repeated page cursor')
    if (page.next_after !== null) seen.add(page.next_after)
    hosts.push(...page.hosts)
    after = page.next_after
  } while (after !== null)
  return hosts
}

export async function fetchHistory(
  settings: ConnectionSettings,
  hostId: string,
  signal?: AbortSignal,
): Promise<Transition[]> {
  signal?.throwIfAborted()
  if (settings.demoMode) return demoTransitions(hostId)
  const response = await fetch(
    `${API_PREFIX}/v1/hosts/${encodeURIComponent(hostId)}/history?limit=30`,
    { headers: headersFor(settings.token), signal: deadline(signal) },
  )
  if (!response.ok)
    throw new Error(await responseError(response, 'Could not load history'))
  const body: unknown = await response.json()
  if (
    !Array.isArray(body) ||
    !body.every(
      (event: unknown) =>
        object(event) &&
        nullableString(event.error) &&
        typeof event.changed_at === 'string' &&
        typeof event.reason === 'string' &&
        status(event.previous_status) &&
        status(event.new_status),
    )
  )
    throw new Error('Monitor returned invalid history')
  return body as Transition[]
}

const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0
const nullableNumber = (value: unknown) => value === null || finite(value)
export function validateSeries(
  value: unknown,
): import('./historyTypes').HistoryResponse {
  if (
    !object(value) ||
    ![
      'from_ms',
      'to_ms',
      'resolution_seconds',
      'source_resolution_seconds',
    ].every((k) => finite(value[k])) ||
    !nullableNumber(value.available_from_ms) ||
    typeof value.membership !== 'string' ||
    !Array.isArray(value.series) ||
    value.series.length > 16 ||
    !value.series.every(
      (s) =>
        object(s) &&
        typeof s.id === 'string' &&
        typeof s.label === 'string' &&
        Array.isArray(s.buckets) &&
        s.buckets.length <= 1000 &&
        s.buckets.every(
          (b) =>
            object(b) &&
            ['start_ms', 'end_ms', 'eligible_ms'].every((k) => finite(b[k])) &&
            nullableNumber(b.latency_p95_ms) &&
            object(b.stats) &&
            [
              'samples',
              'successful_samples',
              'latency_count',
              'latency_sum_ms',
              'up_ms',
              'down_ms',
              'usage_observed_ms',
              'console_user_ms',
              'remote_user_ms',
            ].every((k) => finite((b.stats as Record<string, unknown>)[k])) &&
            nullableNumber(b.stats.latency_min_ms) &&
            nullableNumber(b.stats.latency_max_ms) &&
            Array.isArray(b.stats.latency_histogram) &&
            b.stats.latency_histogram.length === 17 &&
            b.stats.latency_histogram.every(count),
        ),
    )
  )
    throw new Error('Monitor returned invalid chart data')
  return value as unknown as import('./historyTypes').HistoryResponse
}
export function validateEvents(
  value: unknown,
): import('./historyTypes').HistoryEvents {
  if (
    !object(value) ||
    !nullableNumber(value.next_before) ||
    !Array.isArray(value.events) ||
    value.events.length > 1000 ||
    !value.events.every(
      (e) =>
        object(e) &&
        count(e.id) &&
        finite(e.at_ms) &&
        ['host_id', 'name', 'module', 'check_id'].every(
          (k) => typeof e[k] === 'string',
        ) &&
        Array.isArray(e.groups) &&
        e.groups.every((g) => typeof g === 'string') &&
        nullableString(e.previous_state) &&
        object(e.observation) &&
        status(e.observation.state) &&
        typeof e.observation.success === 'boolean' &&
        ['latency_ms', 'console_users', 'remote_users'].every((k) =>
          nullableNumber((e.observation as Record<string, unknown>)[k]),
        ) &&
        nullableString(e.observation.error),
    )
  )
    throw new Error('Monitor returned invalid event data')
  return value as unknown as import('./historyTypes').HistoryEvents
}
export function validateMaintenance(
  value: unknown,
): import('./historyTypes').MaintenanceStatus {
  if (
    !object(value) ||
    !object(value.database) ||
    !['allocated_bytes', 'reusable_bytes', 'wal_bytes', 'pending_spans'].every(
      (k) => finite((value.database as Record<string, unknown>)[k]),
    ) ||
    typeof value.database.incremental_vacuum !== 'boolean' ||
    !nullableNumber(value.database.oldest_pending_ms) ||
    !Array.isArray(value.jobs) ||
    !value.jobs.every(
      (j) =>
        object(j) &&
        typeof j.id === 'string' &&
        typeof j.status === 'string' &&
        ['last_started_ms', 'last_success_ms', 'duration_ms'].every((k) =>
          nullableNumber(j[k]),
        ) &&
        ['next_run_ms', 'work_done', 'failures'].every((k) => finite(j[k])) &&
        nullableString(j.message),
    )
  )
    throw new Error('Monitor returned invalid maintenance data')
  return value as unknown as import('./historyTypes').MaintenanceStatus
}
export async function fetchMonitorData<T>(
  settings: ConnectionSettings,
  path: string,
  validate: (value: unknown) => T,
  signal: AbortSignal,
): Promise<T> {
  const response = await fetch(`${API_PREFIX}${path}`, {
    headers: headersFor(settings.token),
    signal: deadline(signal),
  })
  if (!response.ok)
    throw new Error(
      await responseError(response, 'Could not load monitor data'),
    )
  return validate(await response.json())
}
