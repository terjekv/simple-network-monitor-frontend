import { HistoryPanel } from './HistoryPanel'
import { MaintenancePanel } from './MaintenancePanel'
import { useInventory } from './useInventory'
import {
  Activity,
  Building2,
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  Columns3,
  Command,
  Download,
  EyeOff,
  Filter,
  Gauge,
  ListFilter,
  Moon,
  RefreshCw,
  Search,
  Settings,
  SlidersHorizontal,
  Sun,
  WifiOff,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { fetchHistory } from './api'
import type {
  ColumnKey,
  ConnectionSettings,
  FilterRule,
  HostStatus,
  SortState,
  Transition,
} from './types'

import {
  columns,
  defaultVisibleColumns,
  defaultSettings,
  apiConfigured,
  loadStored,
  saveStored,
  getRoom,
  formatAge,
  plural,
  compare,
  sortValue,
  csvCell,
  statusLabel,
  eligibleHostList,
  detectGroups,
  effectiveStatus,
} from './model'
import type { StatusPreset, Theme, GroupMode } from './model'
import { MetricCard } from './Common'
import { HostDrawer, SettingsModal } from './Details'
import { HostTable } from './HostTable'
function App() {
  const [settings, setSettings] = useState<ConnectionSettings>(() => {
    const stored = loadStored('snm.connection', defaultSettings)
    return apiConfigured ? stored : { ...stored, demoMode: true }
  })
  const { hosts, loading, refreshing, error, lastUpdated, load } =
    useInventory(settings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [theme, setTheme] = useState<Theme>(() =>
    loadStored('snm.theme', 'light'),
  )
  const [view, setView] = useState<'operations' | 'hosts' | 'maintenance'>(
    'operations',
  )
  const [preset, setPreset] = useState<StatusPreset>('attention')
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<SortState>({
    key: 'since',
    direction: 'asc',
  })
  const [visibleColumns, setVisibleColumns] = useState<ColumnKey[]>(() =>
    loadStored('snm.columns', defaultVisibleColumns),
  )
  const [groupMode, setGroupMode] = useState<GroupMode>('room')
  const [rules, setRules] = useState<FilterRule[]>([])
  const [ignoredRooms, setIgnoredRooms] = useState<string[]>(() =>
    loadStored('snm.skippedRooms', []),
  )
  const [hideNoRoom, setHideNoRoom] = useState(false)
  const [columnsOpen, setColumnsOpen] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)
  const [skipRoomsOpen, setSkipRoomsOpen] = useState(false)
  const [roomSkipQuery, setRoomSkipQuery] = useState('')
  const [newRule, setNewRule] = useState<Omit<FilterRule, 'id'>>({
    field: 'room',
    operator: 'is',
    value: '',
  })
  const [selectedHostId, setSelectedHostId] = useState<string | null>(null)
  const selectedHost = hosts.find((host) => host.id === selectedHostId) ?? null
  const [historyError, setHistoryError] = useState<string | null>(null)
  const [historyRetry, setHistoryRetry] = useState(0)
  const [history, setHistory] = useState<Transition[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [, setSidebarOpen] = useState(false)

  useEffect(() => {
    if (selectedHostId && !selectedHost && !loading) {
      setSelectedHostId(null)
      setToast('Selected host was removed from the inventory')
    }
  }, [selectedHostId, selectedHost, loading])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    saveStored('snm.theme', theme)
  }, [theme])

  useEffect(() => {
    saveStored('snm.columns', visibleColumns)
  }, [visibleColumns])

  useEffect(() => {
    saveStored('snm.skippedRooms', ignoredRooms)
  }, [ignoredRooms])

  useEffect(() => {
    if (!selectedHostId) return
    const controller = new AbortController()
    setHistoryLoading(true)
    setHistory([])
    setHistoryError(null)
    fetchHistory(settings, selectedHostId, controller.signal)
      .then((events) => {
        if (!controller.signal.aborted) setHistory(events)
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setHistoryError(
            cause instanceof Error ? cause.message : 'Could not load history',
          )
      })
      .finally(() => {
        if (!controller.signal.aborted) setHistoryLoading(false)
      })
    return () => controller.abort()
  }, [selectedHostId, settings, historyRetry, lastUpdated])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectedHostId(null)
        setColumnsOpen(false)
        setFilterOpen(false)
        setSkipRoomsOpen(false)
        setSettingsOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        document.getElementById('host-search')?.focus()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 2_400)
    return () => window.clearTimeout(timer)
  }, [toast])

  const eligibleHosts = useMemo(
    () =>
      eligibleHostList(
        hosts,
        ignoredRooms,
        hideNoRoom,
        selectedGroup,
        query,
        rules,
      ),
    [hosts, ignoredRooms, hideNoRoom, selectedGroup, query, rules],
  )

  const counts = useMemo(
    () => ({
      all: eligibleHosts.length,
      up: eligibleHosts.filter((host) => effectiveStatus(host) === 'up').length,
      down: eligibleHosts.filter((host) => effectiveStatus(host) === 'down')
        .length,
      unknown: eligibleHosts.filter(
        (host) => effectiveStatus(host) === 'unknown',
      ).length,
    }),
    [eligibleHosts],
  )

  const filteredHosts = useMemo(() => {
    const filtered = eligibleHosts.filter((host) => {
      if (preset === 'attention') return effectiveStatus(host) !== 'up'
      return preset === 'all' || effectiveStatus(host) === preset
    })

    return [...filtered].sort((a, b) => {
      const value = compare(sortValue(a, sort.key), sortValue(b, sort.key))
      return sort.direction === 'asc' ? value : -value
    })
  }, [eligibleHosts, preset, sort])

  const availableRooms = useMemo(
    () =>
      [...new Set(hosts.map(getRoom))].sort((a, b) =>
        a.localeCompare(b, undefined, { numeric: true }),
      ),
    [hosts],
  )

  const roomSkipOptions = useMemo(() => {
    const countsByRoom = new Map<string, { hosts: number; attention: number }>()
    for (const host of hosts) {
      const room = getRoom(host)
      const count = countsByRoom.get(room) ?? { hosts: 0, attention: 0 }
      count.hosts++
      count.attention += Number(effectiveStatus(host) !== 'up')
      countsByRoom.set(room, count)
    }
    const needle = roomSkipQuery.trim().toLocaleLowerCase()
    return availableRooms
      .filter(
        (room) =>
          room !== 'No room' && room.toLocaleLowerCase().includes(needle),
      )
      .map((room) => {
        const count = countsByRoom.get(room)!
        return {
          room,
          hosts: count.hosts,
          attention: count.attention,
        }
      })
  }, [availableRooms, hosts, roomSkipQuery])

  const detectedGroups = useMemo(() => detectGroups(hosts), [hosts])

  const availableGroups = useMemo(
    () => detectedGroups.map((group) => group.name),
    [detectedGroups],
  )

  const groupHostCounts = useMemo(
    () => new Map(detectedGroups.map((group) => [group.name, group.count])),
    [detectedGroups],
  )

  const activeColumns = columns.filter((column) =>
    visibleColumns.includes(column.key),
  )
  const availability =
    counts.up + counts.down ? (counts.up / (counts.up + counts.down)) * 100 : 0
  const attentionCount = counts.down + counts.unknown

  const selectPreset = (value: StatusPreset) => {
    setView('hosts')
    setPreset(value)
    setSidebarOpen(false)
  }

  const selectWorkspace = (value: StatusPreset, mode: GroupMode) => {
    setSelectedGroup(null)
    setView('hosts')
    setPreset(value)
    setGroupMode(mode)
    setSidebarOpen(false)
  }

  const selectGroup = (group: string) => {
    setView('operations')
    setSelectedGroup(group)
    setPreset('all')
    setGroupMode('none')
    setSidebarOpen(false)
  }

  const applySort = (key: ColumnKey) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'since' ? 'asc' : 'desc' },
    )
  }

  const clearFilters = () => {
    setPreset('all')
    setQuery('')
    setRules([])
    setIgnoredRooms([])
    setHideNoRoom(false)
    setSelectedGroup(null)
  }

  const toggleColumn = (key: ColumnKey) => {
    setVisibleColumns((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    )
  }

  const toggleSkippedRoom = (room: string) => {
    setIgnoredRooms((current) =>
      current.includes(room)
        ? current.filter((item) => item !== room)
        : [...current, room],
    )
  }

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      setToast(`${label} copied`)
    } catch {
      setToast('Clipboard access failed. Select and copy the text manually.')
    }
  }

  const saveSettings = (next: ConnectionSettings) => {
    setSettings(next)
    saveStored('snm.connection', { ...next, token: '' })
    setSettingsOpen(false)
    setToast(next.demoMode ? 'Demo source enabled' : 'Monitor connection saved')
  }

  const addRule = () => {
    if (!newRule.value.trim()) return
    setRules((current) => [
      ...current,
      { ...newRule, value: newRule.value.trim(), id: crypto.randomUUID() },
    ])
    setNewRule({ ...newRule, value: '' })
  }

  const exportCsv = () => {
    const headers = [
      'Host',
      'ID',
      'Address',
      'Room',
      'Status',
      'Last change',
      'Groups',
    ]
    const escape = csvCell
    const rows = filteredHosts.map((host) =>
      [
        host.name,
        host.id,
        host.address,
        getRoom(host),
        effectiveStatus(host),
        host.last_change_at,
        host.groups.join(', '),
      ]
        .map(escape)
        .join(','),
    )
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], {
      type: 'text/csv;charset=utf-8',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `network-hosts-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
    setToast(`Exported ${plural(filteredHosts.length, 'host')}`)
  }

  return (
    <div className="app-shell">
      <header className="operations-bar">
        <a
          className="operations-brand"
          href="#"
          onClick={(e) => {
            e.preventDefault()
            setView('operations')
          }}
        >
          <Activity size={25} />
          <strong>Signal</strong>
          <span>NETWORK OPERATIONS</span>
        </a>
        <nav aria-label="Main navigation">
          <button
            className={view === 'operations' ? 'active' : ''}
            onClick={() => {
              setView('operations')
              setSelectedGroup(null)
            }}
          >
            Overview
          </button>
          <button
            className={view === 'hosts' ? 'active' : ''}
            onClick={() => selectWorkspace('all', 'none')}
          >
            All hosts <span>{hosts.length}</span>
          </button>
          <button onClick={() => selectWorkspace('all', 'room')}>Rooms</button>
          <button
            className={view === 'maintenance' ? 'active' : ''}
            onClick={() => setView('maintenance')}
          >
            Maintenance
          </button>
        </nav>
        <div className="operations-actions">
          <button
            className="icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label="Settings"
          >
            <Settings size={18} />
          </button>
          <button
            className="icon-button"
            aria-label={`Use ${theme === 'light' ? 'dark' : 'light'} theme`}
            onClick={() =>
              setTheme((value) => (value === 'light' ? 'dark' : 'light'))
            }
          >
            {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
          </button>
        </div>
      </header>
      {view !== 'maintenance' && (
        <div className="operations-scopes">
          <nav aria-label="Host groups">
            <span>HOST GROUPS</span>
            {availableGroups.map((group) => (
              <button
                key={group}
                className={selectedGroup === group ? 'selected' : ''}
                aria-current={selectedGroup === group ? 'page' : undefined}
                aria-label={`Show ${group} hosts, ${groupHostCounts.get(group) ?? 0} total`}
                onClick={() => selectGroup(group)}
              >
                {group}
                <small>{groupHostCounts.get(group)}</small>
              </button>
            ))}
          </nav>
          <nav aria-label="Saved views">
            <button onClick={() => selectPreset('attention')}>
              Needs attention <b>{attentionCount}</b>
            </button>
            <button onClick={() => selectPreset('down')}>
              Down by room <b>{counts.down}</b>
            </button>
            <button
              onClick={() => {
                selectPreset('all')
                setSort({ key: 'since', direction: 'desc' })
              }}
            >
              Recently changed
            </button>
          </nav>
        </div>
      )}

      <main className="main">
        <div className="workspace">
          <section className="page-heading">
            <div>
              <div className="heading-kicker">
                <span className={`live-indicator${error ? ' live-error' : ''}`}>
                  <span />
                  {error
                    ? 'Connection lost'
                    : settings.demoMode
                      ? 'Demo mode'
                      : 'Live'}
                </span>
                <span>
                  {lastUpdated
                    ? `Updated ${formatAge(lastUpdated.toISOString(), true)}`
                    : 'Connecting to monitor'}
                </span>
              </div>
              <h1>
                {view === 'maintenance'
                  ? 'System health'
                  : selectedGroup
                    ? selectedGroup
                    : view === 'hosts'
                      ? 'Host inventory'
                      : 'Network overview'}
              </h1>
              <p>
                {selectedGroup
                  ? `Reachability and usage for hosts in the ${selectedGroup} group.`
                  : 'Reachability and usage across your monitored estate.'}
              </p>
            </div>
            <div className="heading-actions">
              <button
                className="button secondary"
                aria-label="Export"
                onClick={exportCsv}
                disabled={!filteredHosts.length}
              >
                <Download size={15} />
                <span className="button-label">Export</span>
              </button>
              <button
                className="button secondary"
                aria-label="Configure"
                onClick={() => setSettingsOpen(true)}
              >
                <SlidersHorizontal size={15} />
                <span className="button-label">Configure</span>
              </button>
              <button
                className="button primary refresh-button"
                aria-label="Refresh"
                onClick={() => void load(true)}
              >
                <RefreshCw size={15} className={refreshing ? 'spin' : ''} />
                <span className="button-label">Refresh</span>
              </button>
            </div>
          </section>

          {error && (
            <div className="error-banner">
              <span>
                <AlertCircle size={18} />
              </span>
              <div>
                <strong>We couldn’t reach the monitor</strong>
                <p>
                  {error}. Check SNM_API_URL on the frontend server and its
                  authentication.
                </p>
              </div>
              <button
                className="button secondary compact"
                onClick={() => setSettingsOpen(true)}
              >
                Check connection
              </button>
            </div>
          )}

          {view === 'maintenance' ? (
            <MaintenancePanel settings={settings} />
          ) : (
            <>
              <section
                className="metrics-grid"
                aria-label="Host status summary"
              >
                <MetricCard
                  label="Monitored hosts"
                  value={counts.all}
                  detail={`${availability.toFixed(1)}% responding`}
                  tone="neutral"
                  icon={<Gauge size={19} />}
                  active={preset === 'all'}
                  onClick={() => selectPreset('all')}
                />
                <MetricCard
                  label="Online"
                  value={counts.up}
                  detail={
                    counts.all
                      ? `${Math.round((counts.up / counts.all) * 100)}% of total`
                      : 'No data'
                  }
                  tone="success"
                  icon={<CheckCircle2 size={19} />}
                  active={preset === 'up'}
                  onClick={() => selectPreset('up')}
                />
                <MetricCard
                  label="Offline"
                  value={counts.down}
                  detail={
                    counts.down
                      ? 'Requires attention'
                      : 'Nothing to investigate'
                  }
                  tone="danger"
                  icon={<WifiOff size={19} />}
                  active={preset === 'down'}
                  onClick={() => selectPreset('down')}
                />
                <MetricCard
                  label="Unknown"
                  value={counts.unknown}
                  detail={
                    counts.unknown ? 'Awaiting a signal' : 'All hosts observed'
                  }
                  tone="warning"
                  icon={<CircleHelp size={19} />}
                  active={preset === 'unknown'}
                  onClick={() => selectPreset('unknown')}
                />
              </section>
              {view === 'operations' && (
                <HistoryPanel
                  key={selectedGroup ?? 'all'}
                  initialGroup={selectedGroup}
                  settings={settings}
                  availableGroups={availableGroups}
                />
              )}

              <section className="hosts-panel">
                <div className="panel-header">
                  <div>
                    <span className="eyebrow">Host inventory</span>
                    <div className="panel-title-line">
                      <h2>
                        {selectedGroup
                          ? `${selectedGroup} · ${
                              preset === 'attention'
                                ? 'Needs attention'
                                : preset === 'all'
                                  ? 'All hosts'
                                  : statusLabel[preset]
                            }`
                          : preset === 'attention'
                            ? 'Needs attention'
                            : preset === 'all'
                              ? 'All monitored hosts'
                              : statusLabel[preset]}
                      </h2>
                      <span className="result-count">
                        {filteredHosts.length}
                      </span>
                    </div>
                  </div>
                  <div className="view-controls" aria-label="Grouping controls">
                    <button
                      className={groupMode === 'room' ? 'active' : ''}
                      onClick={() => setGroupMode('room')}
                    >
                      <Building2 size={14} />
                      By room
                    </button>
                    <button
                      className={groupMode === 'none' ? 'active' : ''}
                      onClick={() => setGroupMode('none')}
                    >
                      <ListFilter size={14} />
                      List
                    </button>
                  </div>
                </div>

                <div className="toolbar">
                  <label className="search-field" htmlFor="host-search">
                    <Search size={17} />
                    <input
                      id="host-search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search hosts, IPs, rooms or groups"
                    />
                    <span className="shortcut">
                      <Command size={11} /> K
                    </span>
                  </label>
                  <div className="toolbar-actions">
                    <div className="popover-anchor">
                      <button
                        className={`button secondary${filterOpen ? ' active' : ''}`}
                        onClick={() => {
                          setFilterOpen((value) => !value)
                          setColumnsOpen(false)
                          setSkipRoomsOpen(false)
                        }}
                      >
                        <Filter size={15} />
                        Filter
                        {rules.length + (hideNoRoom ? 1 : 0) > 0 && (
                          <span className="button-count">
                            {rules.length + (hideNoRoom ? 1 : 0)}
                          </span>
                        )}
                      </button>
                      {filterOpen && (
                        <div className="popover filter-popover">
                          <div className="popover-header">
                            <div>
                              <strong>Filter hosts</strong>
                              <small>Rules are combined with “and”</small>
                            </div>
                            <button
                              className="icon-button small"
                              onClick={() => setFilterOpen(false)}
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <div className="rule-builder">
                            <div className="select-wrap">
                              <select
                                value={newRule.field}
                                onChange={(event) =>
                                  setNewRule({
                                    ...newRule,
                                    field: event.target
                                      .value as FilterRule['field'],
                                    value: '',
                                  })
                                }
                              >
                                <option value="room">Room</option>
                                <option value="group">Group</option>
                                <option value="status">Status</option>
                                <option value="name">Name</option>
                              </select>
                              <ChevronDown size={13} />
                            </div>
                            <div className="select-wrap">
                              <select
                                value={newRule.operator}
                                onChange={(event) =>
                                  setNewRule({
                                    ...newRule,
                                    operator: event.target
                                      .value as FilterRule['operator'],
                                  })
                                }
                              >
                                <option value="is">is</option>
                                <option value="is_not">is not</option>
                                <option value="contains">contains</option>
                              </select>
                              <ChevronDown size={13} />
                            </div>
                            {newRule.field === 'room' ||
                            newRule.field === 'group' ||
                            newRule.field === 'status' ? (
                              <div className="select-wrap rule-value">
                                <select
                                  value={newRule.value}
                                  onChange={(event) =>
                                    setNewRule({
                                      ...newRule,
                                      value: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">Choose…</option>
                                  {(newRule.field === 'room'
                                    ? availableRooms
                                    : newRule.field === 'group'
                                      ? availableGroups
                                      : ['up', 'down', 'unknown']
                                  ).map((value) => (
                                    <option value={value} key={value}>
                                      {newRule.field === 'status'
                                        ? statusLabel[value as HostStatus]
                                        : value}
                                    </option>
                                  ))}
                                </select>
                                <ChevronDown size={13} />
                              </div>
                            ) : (
                              <input
                                className="rule-input"
                                value={newRule.value}
                                onChange={(event) =>
                                  setNewRule({
                                    ...newRule,
                                    value: event.target.value,
                                  })
                                }
                                placeholder="Value"
                                onKeyDown={(event) =>
                                  event.key === 'Enter' && addRule()
                                }
                              />
                            )}
                            <button
                              className="button primary compact"
                              disabled={!newRule.value}
                              onClick={addRule}
                            >
                              Add
                            </button>
                          </div>
                          {rules.length > 0 && (
                            <div className="active-rules">
                              {rules.map((rule) => (
                                <div key={rule.id}>
                                  <span>{rule.field}</span>
                                  <small>
                                    {rule.operator.replace('_', ' ')}
                                  </small>
                                  <strong>{rule.value}</strong>
                                  <button
                                    onClick={() =>
                                      setRules((current) =>
                                        current.filter(
                                          (item) => item.id !== rule.id,
                                        ),
                                      )
                                    }
                                    aria-label="Remove filter"
                                  >
                                    <X size={13} />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                          <div className="filter-options">
                            <span>Additional options</span>
                            <label className="check-row">
                              <input
                                type="checkbox"
                                checked={hideNoRoom}
                                onChange={(event) =>
                                  setHideNoRoom(event.target.checked)
                                }
                              />
                              <span className="custom-check">
                                <Check size={12} />
                              </span>
                              Hide hosts without a room
                            </label>
                          </div>
                          <div className="popover-footer">
                            <button
                              onClick={() => {
                                setRules([])
                                setHideNoRoom(false)
                              }}
                            >
                              Clear filters
                            </button>
                            <button
                              className="button primary compact"
                              onClick={() => setFilterOpen(false)}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="popover-anchor">
                      <button
                        className={`button secondary${skipRoomsOpen ? ' active' : ''}`}
                        onClick={() => {
                          setSkipRoomsOpen((value) => !value)
                          setFilterOpen(false)
                          setColumnsOpen(false)
                        }}
                      >
                        <EyeOff size={15} />
                        Skip rooms
                        {ignoredRooms.length > 0 && (
                          <span className="button-count">
                            {ignoredRooms.length}
                          </span>
                        )}
                      </button>
                      {skipRoomsOpen && (
                        <div className="popover skip-rooms-popover">
                          <div className="popover-header">
                            <div>
                              <strong>Skip rooms</strong>
                              <small>
                                Hidden rooms stay skipped on this browser
                              </small>
                            </div>
                            <button
                              className="icon-button small"
                              onClick={() => setSkipRoomsOpen(false)}
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <label className="room-skip-search">
                            <Search size={14} />
                            <input
                              value={roomSkipQuery}
                              onChange={(event) =>
                                setRoomSkipQuery(event.target.value)
                              }
                              placeholder="Find a room"
                            />
                          </label>
                          <div className="skip-room-list">
                            {roomSkipOptions.map((option) => (
                              <label
                                className="check-row skip-room-row"
                                key={option.room}
                              >
                                <input
                                  type="checkbox"
                                  checked={ignoredRooms.includes(option.room)}
                                  onChange={() =>
                                    toggleSkippedRoom(option.room)
                                  }
                                />
                                <span className="custom-check">
                                  <Check size={12} />
                                </span>
                                <strong>{option.room}</strong>
                                <span>{plural(option.hosts, 'host')}</span>
                                {option.attention > 0 && (
                                  <small>
                                    {plural(option.attention, 'alert')}
                                  </small>
                                )}
                              </label>
                            ))}
                            {roomSkipOptions.length === 0 && (
                              <div className="skip-room-empty">
                                No rooms match “{roomSkipQuery}”.
                              </div>
                            )}
                          </div>
                          <div className="popover-footer">
                            <button
                              disabled={ignoredRooms.length === 0}
                              onClick={() => setIgnoredRooms([])}
                            >
                              Show all rooms
                            </button>
                            <button
                              className="button primary compact"
                              onClick={() => setSkipRoomsOpen(false)}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="popover-anchor">
                      <button
                        className={`button secondary${columnsOpen ? ' active' : ''}`}
                        onClick={() => {
                          setColumnsOpen((value) => !value)
                          setFilterOpen(false)
                          setSkipRoomsOpen(false)
                        }}
                      >
                        <Columns3 size={15} />
                        Fields
                      </button>
                      {columnsOpen && (
                        <div className="popover columns-popover">
                          <div className="popover-header">
                            <div>
                              <strong>Visible fields</strong>
                              <small>Choose what appears in the table</small>
                            </div>
                            <button
                              className="icon-button small"
                              onClick={() => setColumnsOpen(false)}
                            >
                              <X size={15} />
                            </button>
                          </div>
                          <div className="column-options">
                            {columns.map((column) => (
                              <label className="check-row" key={column.key}>
                                <input
                                  type="checkbox"
                                  checked={visibleColumns.includes(column.key)}
                                  disabled={column.required}
                                  onChange={() => toggleColumn(column.key)}
                                />
                                <span className="custom-check">
                                  <Check size={12} />
                                </span>
                                <span>{column.label}</span>
                                {column.required && <small>Required</small>}
                              </label>
                            ))}
                          </div>
                          <div className="popover-footer">
                            <button
                              onClick={() =>
                                setVisibleColumns(defaultVisibleColumns)
                              }
                            >
                              Reset to default
                            </button>
                            <button
                              className="button primary compact"
                              onClick={() => setColumnsOpen(false)}
                            >
                              Done
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {(preset !== 'all' ||
                  selectedGroup ||
                  rules.length > 0 ||
                  ignoredRooms.length > 0 ||
                  hideNoRoom ||
                  query) && (
                  <div className="filter-strip">
                    <span className="filter-strip-label">Showing</span>
                    {preset !== 'all' && (
                      <button
                        className="filter-chip"
                        onClick={() => setPreset('all')}
                      >
                        Status:{' '}
                        {preset === 'attention'
                          ? 'Needs attention'
                          : statusLabel[preset]}
                        <X size={12} />
                      </button>
                    )}
                    {selectedGroup && (
                      <button
                        className="filter-chip"
                        onClick={() => setSelectedGroup(null)}
                      >
                        Group: {selectedGroup}
                        <X size={12} />
                      </button>
                    )}
                    {rules.map((rule) => (
                      <button
                        className="filter-chip"
                        key={rule.id}
                        onClick={() =>
                          setRules((current) =>
                            current.filter((item) => item.id !== rule.id),
                          )
                        }
                      >
                        {rule.field}: {rule.value}
                        <X size={12} />
                      </button>
                    ))}
                    {ignoredRooms.length > 0 && (
                      <button
                        className="filter-chip"
                        onClick={() => setIgnoredRooms([])}
                      >
                        {plural(ignoredRooms.length, 'room')} skipped
                        <X size={12} />
                      </button>
                    )}
                    {hideNoRoom && (
                      <button
                        className="filter-chip"
                        onClick={() => setHideNoRoom(false)}
                      >
                        Room required
                        <X size={12} />
                      </button>
                    )}
                    {query && (
                      <button
                        className="filter-chip"
                        onClick={() => setQuery('')}
                      >
                        Search: “{query}”
                        <X size={12} />
                      </button>
                    )}
                    <button className="clear-link" onClick={clearFilters}>
                      Clear all
                    </button>
                  </div>
                )}

                <HostTable
                  hosts={filteredHosts}
                  loading={loading}
                  activeColumns={activeColumns}
                  sort={sort}
                  groupMode={groupMode}
                  clearFilters={clearFilters}
                  applySort={applySort}
                  toggleSkippedRoom={toggleSkippedRoom}
                  setToast={setToast}
                  setSelectedHostId={setSelectedHostId}
                  copy={copy}
                />
              </section>
            </>
          )}
        </div>
      </main>

      {selectedHost && (
        <HostDrawer
          host={selectedHost}
          settings={settings}
          history={history}
          historyLoading={historyLoading}
          historyError={historyError}
          onRetry={() => setHistoryRetry((value) => value + 1)}
          onClose={() => setSelectedHostId(null)}
          onCopy={copy}
        />
      )}
      {settingsOpen && (
        <SettingsModal
          value={settings}
          apiConfigured={apiConfigured}
          onSave={saveSettings}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={15} />
          {toast}
        </div>
      )}
    </div>
  )
}

export default App
