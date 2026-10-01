import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const storage = new Map<string, string>()

beforeEach(() => {
  storage.clear()
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => storage.set(key, value)),
    removeItem: vi.fn((key: string) => storage.delete(key)),
    clear: vi.fn(() => storage.clear()),
  })
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  )
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('network overview', () => {
  it('loads the attention view and can switch to all hosts', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Needs attention' })).toBeInTheDocument()
    expect(await screen.findByText('ws04.lab204.example.org')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /Monitored hosts/i }))

    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'All monitored hosts' })).toBeInTheDocument(),
    )
    expect(screen.getByText('router01.core.example.org')).toBeInTheDocument()
  })

  it('searches hosts and opens host details', async () => {
    render(<App />)
    await screen.findByText('ws04.lab204.example.org')

    fireEvent.change(screen.getByPlaceholderText('Search hosts, IPs, rooms or groups'), {
      target: { value: 'studio-2-mac06' },
    })

    const host = await screen.findByText('mac06.studio2.example.org')
    fireEvent.click(host)

    expect(await screen.findByRole('heading', { name: 'mac06.studio2.example.org' })).toBeInTheDocument()
    expect(screen.getByText(/Unreachable for/)).toBeInTheDocument()
    expect(screen.queryByRole('img', { name: 'Recent latency trend' })).not.toBeInTheDocument()
    expect(screen.queryByText('Latency')).not.toBeInTheDocument()
  })

  it('supports configurable fields and sortable columns', async () => {
    render(<App />)
    await screen.findByText('ws04.lab204.example.org')

    fireEvent.click(screen.getByRole('button', { name: 'Fields' }))
    const addressField = screen.getByRole('checkbox', { name: 'IP address' })
    expect(addressField).toBeChecked()
    expect(screen.queryByRole('checkbox', { name: 'Latency' })).not.toBeInTheDocument()
    fireEvent.click(addressField)

    const table = screen.getByRole('table')
    expect(within(table).queryByRole('columnheader', { name: /IP address/i })).not.toBeInTheDocument()

    const changedHeader = within(table).getByRole('columnheader', { name: /Changed/i })
    expect(changedHeader).toHaveAttribute('aria-sort', 'ascending')
    fireEvent.click(within(changedHeader).getByRole('button'))
    expect(changedHeader).toHaveAttribute('aria-sort', 'descending')
  })

  it('detects host groups and scopes the dashboard to a selected group', async () => {
    render(<App />)
    await screen.findByText('ws04.lab204.example.org')

    const groupNavigation = screen.getByRole('navigation', { name: 'Host groups' })
    await waitFor(() =>
      expect(within(groupNavigation).getAllByRole('button')).toHaveLength(15),
    )
    const groupButtons = within(groupNavigation).getAllByRole('button')
    expect(groupButtons[0]).toHaveAccessibleName('Show linux hosts, 20 total')
    expect(groupButtons[1]).toHaveAccessibleName('Show student-lab hosts, 12 total')
    expect(groupButtons[2]).toHaveAccessibleName('Show network hosts, 4 total')

    fireEvent.click(
      within(groupNavigation).getByRole('button', { name: /Show network hosts, 4 total/i }),
    )

    expect(await screen.findByRole('heading', { name: 'network' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'network · All hosts' })).toBeInTheDocument()
    expect(screen.getByText('switch01.lab204.example.org')).toBeInTheDocument()
    expect(screen.getByText('ap01.studio2.example.org')).toBeInTheDocument()
    expect(screen.queryByText('ws04.lab204.example.org')).not.toBeInTheDocument()

    const summary = screen.getByRole('region', { name: 'Host status summary' })
    expect(
      within(within(summary).getByRole('button', { name: /Monitored hosts/i })).getByText('4'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Group: network' })).toBeInTheDocument()
  })

  it('persists skipped rooms and updates attention counters', async () => {
    render(<App />)
    await screen.findByText('ws04.lab204.example.org')

    const savedViews = screen.getByRole('navigation', { name: 'Saved views' })
    const summary = screen.getByRole('region', { name: 'Host status summary' })
    const attentionView = within(savedViews).getByRole('button', { name: /Needs attention/i })
    const downView = within(savedViews).getByRole('button', { name: /Down by room/i })
    const monitoredCard = within(summary).getByRole('button', { name: /Monitored hosts/i })
    const offlineCard = within(summary).getByRole('button', { name: /Offline/i })
    expect(within(attentionView).getByText('15')).toBeInTheDocument()
    expect(within(downView).getByText('12')).toBeInTheDocument()
    expect(within(monitoredCard).getByText('32')).toBeInTheDocument()
    expect(within(offlineCard).getByText('12')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Skip rooms' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /LAB-204/i }))

    await waitFor(() => {
      expect(screen.queryByText('ws04.lab204.example.org')).not.toBeInTheDocument()
      expect(within(attentionView).getByText('13')).toBeInTheDocument()
      expect(within(downView).getByText('10')).toBeInTheDocument()
      expect(within(monitoredCard).getByText('28')).toBeInTheDocument()
      expect(within(offlineCard).getByText('10')).toBeInTheDocument()
      expect(JSON.parse(storage.get('snm.skippedRooms') ?? '[]')).toContain('LAB-204')
    })
  })
})
