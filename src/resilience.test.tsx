import '@testing-library/jest-dom/vitest'
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { Host } from './types'
const mocked = vi.hoisted(() => ({ hosts: vi.fn(), history: vi.fn() }))
vi.mock('./api', async (importOriginal) => ({
  ...await importOriginal<typeof import('./api')>(),
  fetchHosts: mocked.hosts,
  fetchHistory: mocked.history,
}))
import App from './App'
import {
  csvCell,
  groupHosts,
  loadStored,
  usageValue,
  effectiveStatus,
} from './model'

const fixture: Host = {
  id: 'r1',
  name: 'router.example',
  address: '192.0.2.1',
  groups: ['core'],
  metadata: { room: 'Room example' },
  status: 'down',
  last_checked_at: null,
  last_change_at: null,
  latency_ms: null,
  consecutive_failures: 1,
  consecutive_successes: 0,
  last_error: null,
  usage: {
    collected_at: '2026-01-01T00:00:00Z',
    status: 'error',
    console_users: null,
    remote_users: null,
    error: 'fake collection error',
  },
}
beforeEach(() => {
  const storage = new Map<string, string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => storage.set(key, value),
    clear: () => storage.clear(),
  })
  mocked.hosts.mockReset()
  mocked.history.mockReset()
  mocked.hosts.mockResolvedValue([fixture])
  mocked.history.mockResolvedValue([])
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

it('renders failed usage as unavailable in the drawer', async () => {
  render(<App />)
  fireEvent.click(await screen.findByText('router.example'))
  expect(
    within(screen.getByRole('dialog')).getByText('Unavailable'),
  ).toBeVisible()
})
it('refreshes an open drawer from the latest host record', async () => {
  render(<App />)
  fireEvent.click(await screen.findByText('router.example'))
  mocked.hosts.mockResolvedValue([{ ...fixture, name: 'renamed.example' }])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  expect(
    await screen.findByRole('heading', { name: 'renamed.example' }),
  ).toBeVisible()
})
it('shows a history failure and successfully retries it', async () => {
  mocked.history.mockRejectedValueOnce(new Error('History unavailable'))
  render(<App />)
  fireEvent.click(await screen.findByText('router.example'))
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'History unavailable',
  )
  expect(
    screen.queryByText('No status changes have been recorded.'),
  ).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Retry history' }))
  expect(
    await screen.findByText('No status changes have been recorded.'),
  ).toBeVisible()
})
it('ignores a late response from an aborted inventory request', async () => {
  let resolveFirst: (hosts: Host[]) => void = () => {}
  mocked.hosts.mockReturnValueOnce(
    new Promise<Host[]>((resolve) => {
      resolveFirst = resolve
    }),
  )
  render(<App />)
  mocked.hosts.mockResolvedValue([{ ...fixture, name: 'new.example' }])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('new.example')
  resolveFirst([fixture])
  await waitFor(() =>
    expect(screen.queryByText('router.example')).not.toBeInTheDocument(),
  )
})
it('moves focus into settings, traps it and restores it on Escape', async () => {
  render(<App />)
  await screen.findByText('router.example')
  const opener = screen.getByRole('button', { name: 'Settings' })
  opener.focus()
  fireEvent.click(opener)
  const dialog = screen.getByRole('dialog')
  expect(dialog.contains(document.activeElement)).toBe(true)
  fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true })
  expect(dialog.contains(document.activeElement)).toBe(true)
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(opener).toHaveFocus()
})
it('survives unavailable local storage', async () => {
  vi.spyOn(localStorage, 'setItem').mockImplementation(() => {
    throw new Error('denied')
  })
  render(<App />)
  expect(await screen.findByText('router.example')).toBeVisible()
})
it('validates persisted preferences and removes persisted credentials', () => {
  localStorage.setItem('snm.columns', '{"invalid":true}')
  expect(loadStored('snm.columns', ['host'])).toEqual(['host'])
  localStorage.setItem(
    'snm.connection',
    JSON.stringify({
      token: 'fake-secret',
      refreshSeconds: -1,
      demoMode: 'bad',
    }),
  )
  expect(loadStored('snm.connection', {})).toMatchObject({
    token: '',
    refreshSeconds: 30,
  })
  expect(localStorage.getItem('snm.connection')).not.toContain('fake-secret')
})
it.each(['=SUM(A1)', '+cmd', '-cmd', '@formula', ' \t=SUM(A1)'])(
  'neutralizes spreadsheet formula %s',
  (value) => {
    expect(csvCell(value).startsWith('"\'')).toBe(true)
  },
)
it('groups a large single-room inventory without losing hosts', () => {
  const hosts = Array.from({ length: 20_000 }, (_, id) => ({
    ...fixture,
    id: String(id),
  }))
  const groups = groupHosts(hosts, 'room', { key: 'room', direction: 'asc' })
  expect(groups).toHaveLength(1)
  expect(groups[0][1]).toHaveLength(20_000)
})
it('bounds rendered rows and allows paging through the full inventory', async () => {
  mocked.hosts.mockResolvedValue(
    Array.from({ length: 1000 }, (_, id) => ({
      ...fixture,
      id: String(id),
      name: `host-${id}.example`,
    })),
  )
  const { container } = render(<App />)
  await screen.findByText('host-0.example')
  expect(container.querySelectorAll('.host-row')).toHaveLength(100)
  fireEvent.click(screen.getByRole('button', { name: 'Next page' }))
  expect(container.querySelectorAll('.host-row')).toHaveLength(100)
  expect(screen.queryByText('host-0.example')).not.toBeInTheDocument()
})
it('distinguishes stale, disabled and missing observations', () => {
  expect(usageValue({ ...fixture, usage_stale: true })).toBe('Stale')
  expect(usageValue({ ...fixture, usage_enabled: false })).toBe('Disabled')
  expect(usageValue({ ...fixture, usage: null })).toBe('Unknown')
})

it('does not count stale or disabled last-known successes as online', () => {
  expect(effectiveStatus({ ...fixture, status: 'up', icmp_stale: true })).toBe(
    'unknown',
  )
  expect(
    effectiveStatus({ ...fixture, status: 'up', icmp_enabled: false }),
  ).toBe('unknown')
})

it('closes a removed host and does not reopen it if that ID returns', async () => {
  render(<App />)
  fireEvent.click(await screen.findByText('router.example'))
  mocked.hosts.mockResolvedValue([])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await waitFor(() =>
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
  )
  mocked.hosts.mockResolvedValue([fixture])
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }))
  await screen.findByText('router.example')
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
})
it('reports a denied clipboard request without an unhandled rejection', async () => {
  vi.stubGlobal('navigator', {
    ...navigator,
    clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) },
  })
  render(<App />)
  fireEvent.click(
    await screen.findByRole('button', { name: 'Copy router.example' }),
  )
  expect(
    await screen.findByText(
      'Clipboard access failed. Select and copy the text manually.',
    ),
  ).toBeVisible()
})
