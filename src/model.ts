import type {
  ColumnDefinition,
  ColumnKey,
  ConnectionSettings,
  Host,
  HostStatus,
  FilterRule,
} from './types'
export const columns: ColumnDefinition[] = [
  { key: 'host', label: 'Host', required: true },
  { key: 'room', label: 'Room' },
  { key: 'address', label: 'IP address' },
  { key: 'groups', label: 'Groups' },
  { key: 'status', label: 'Status' },
  { key: 'since', label: 'Changed' },
  { key: 'checked', label: 'Last check' },
  { key: 'failures', label: 'Failures', align: 'right' },
  { key: 'usage', label: 'Users', align: 'right' },
]

export const defaultVisibleColumns: ColumnKey[] = [
  'host',
  'room',
  'address',
  'groups',
  'status',
  'since',
  'failures',
]

export const apiConfigured = window.__SNM_CONFIG__?.apiConfigured ?? false

export const defaultSettings: ConnectionSettings = {
  token: '',
  refreshSeconds: 30,
  demoMode: !apiConfigured,
}

export const statusLabel: Record<HostStatus, string> = {
  up: 'Online',
  down: 'Offline',
  unknown: 'Unknown',
}

export type StatusPreset = 'all' | 'attention' | HostStatus
export type Theme = 'light' | 'dark'
export type GroupMode = 'room' | 'none'

export const saveStored = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* Storage may be unavailable. */
  }
}

export const loadStored = <T>(key: string, fallback: T): T => {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(key) ?? 'null')
    if (key === 'snm.theme' && (raw === 'light' || raw === 'dark'))
      return raw as T
    if (key === 'snm.columns' && Array.isArray(raw)) {
      return [
        ...new Set([
          'host',
          ...raw.filter((value) =>
            columns.some((column) => column.key === value),
          ),
        ]),
      ] as T
    }
    if (
      key === 'snm.skippedRooms' &&
      Array.isArray(raw) &&
      raw.every((value) => typeof value === 'string')
    )
      return raw as T
    if (key === 'snm.connection' && raw && typeof raw === 'object') {
      const value = raw as Record<string, unknown>
      const settings = {
        token: '',
        demoMode:
          typeof value.demoMode === 'boolean'
            ? value.demoMode
            : defaultSettings.demoMode,
        refreshSeconds: [0, 10, 30, 60, 300].includes(
          Number(value.refreshSeconds),
        )
          ? Number(value.refreshSeconds)
          : 30,
      }
      saveStored(key, settings) // Remove tokens persisted by earlier versions.
      return settings as T
    }
  } catch {
    /* Fall back safely when preferences are malformed or unavailable. */
  }
  return fallback
}

export const effectiveStatus = (host: Host): HostStatus =>
  host.icmp_enabled === false || host.icmp_stale ? 'unknown' : host.status

export const usageValue = (host: Host): string | number => {
  if (host.usage_enabled === false) return 'Disabled'
  if (host.usage_stale) return 'Stale'
  if (!host.usage) return 'Unknown'
  if (
    host.usage.status !== 'ok' ||
    host.usage.console_users === null ||
    host.usage.remote_users === null
  )
    return 'Unavailable'
  return host.usage.console_users + host.usage.remote_users
}

export const csvCell = (value: string | number | null) => {
  const text = String(value ?? '')
  const safe = /^[\s]*[=+@-]/.test(text) ? "'" + text : text
  return `"${safe.replaceAll('"', '""')}"`
}

export const groupHosts = (
  hosts: Host[],
  mode: GroupMode,
  sort: { key: string; direction: string },
): [string, Host[]][] => {
  if (mode === 'none') return [['All hosts', hosts]]
  const grouped = new Map<string, Host[]>()
  for (const host of hosts) {
    const room = getRoom(host)
    let bucket = grouped.get(room)
    if (!bucket) {
      bucket = []
      grouped.set(room, bucket)
    }
    bucket.push(host)
  }
  const direction = sort.key === 'room' && sort.direction === 'desc' ? -1 : 1
  return [...grouped].sort(([a], [b]) => compare(a, b) * direction)
}

export const getRoom = (host: Host) =>
  String(host.metadata.room ?? '').trim() || 'No room'

export const getGroups = (host: Host) =>
  host.groups.map((group) => group.trim()).filter((group) => group.length > 0)

export const hostIsInGroup = (host: Host, selectedGroup: string) =>
  getGroups(host).some(
    (group) => group.toLocaleLowerCase() === selectedGroup.toLocaleLowerCase(),
  )

export const timeValue = (value: string | null) =>
  value ? new Date(value).getTime() : 0

export const formatAge = (timestamp: string | null, long = false) => {
  if (!timestamp) return 'Never'
  const seconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(timestamp).getTime()) / 1000),
  )
  if (seconds < 60) return long ? 'less than a minute ago' : '<1m'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60)
    return long
      ? `${minutes} minute${minutes === 1 ? '' : 's'} ago`
      : `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return long
      ? `${hours} hour${hours === 1 ? '' : 's'} ago`
      : `${hours}h${rest ? ` ${rest}m` : ''}`
  }
  const days = Math.floor(hours / 24)
  const rest = hours % 24
  return long
    ? `${days} day${days === 1 ? '' : 's'} ago`
    : `${days}d${rest ? ` ${rest}h` : ''}`
}

export const plural = (value: number, word: string) =>
  `${value} ${word}${value === 1 ? '' : 's'}`

export const compare = (a: string | number, b: string | number) =>
  typeof a === 'number' && typeof b === 'number'
    ? a - b
    : String(a).localeCompare(String(b), undefined, {
        numeric: true,
        sensitivity: 'base',
      })

export const sortValue = (host: Host, key: ColumnKey): string | number => {
  switch (key) {
    case 'host':
      return host.name
    case 'room':
      return getRoom(host)
    case 'address':
      return host.address
    case 'groups':
      return host.groups.join(',')
    case 'status':
      return { down: 0, unknown: 1, up: 2 }[effectiveStatus(host)]
    case 'since':
      return timeValue(host.last_change_at)
    case 'checked':
      return timeValue(host.last_checked_at)
    case 'failures':
      return host.consecutive_failures
    case 'usage':
      return typeof usageValue(host) === 'number'
        ? Number(usageValue(host))
        : -1
  }
}

export function eligibleHostList(
  hosts: Host[],
  ignoredRooms: string[],
  hideNoRoom: boolean,
  selectedGroup: string | null,
  query: string,
  rules: FilterRule[],
) {
  const needle = query.trim().toLocaleLowerCase()

  const skipped = new Set(ignoredRooms)
  return hosts.filter((host) => {
    if (skipped.has(getRoom(host))) return false
    if (hideNoRoom && getRoom(host) === 'No room') return false
    if (selectedGroup && !hostIsInGroup(host, selectedGroup)) return false
    if (
      needle &&
      ![
        host.name,
        host.id,
        host.address,
        getRoom(host),
        ...host.groups,
        ...Object.values(host.metadata).map(String),
      ]
        .join(' ')
        .toLocaleLowerCase()
        .includes(needle)
    ) {
      return false
    }

    return rules.every((rule) => {
      const candidate =
        rule.field === 'status'
          ? effectiveStatus(host)
          : rule.field === 'room'
            ? getRoom(host)
            : rule.field === 'group'
              ? host.groups.join(', ')
              : `${host.name} ${host.id}`
      const left = candidate.toLocaleLowerCase()
      const right = rule.value.toLocaleLowerCase()
      if (rule.operator === 'contains') return left.includes(right)
      if (rule.operator === 'is_not') {
        return rule.field === 'group'
          ? !host.groups.some((group) => group.toLocaleLowerCase() === right)
          : left !== right
      }
      return rule.field === 'group'
        ? host.groups.some((group) => group.toLocaleLowerCase() === right)
        : left === right
    })
  })
}

export function detectGroups(hosts: Host[]) {
  const detected = new Map<string, { name: string; count: number }>()
  hosts.forEach((host) => {
    const hostGroups = new Map(
      getGroups(host).map((group) => [group.toLocaleLowerCase(), group]),
    )
    hostGroups.forEach((name, key) => {
      const existing = detected.get(key)
      detected.set(key, {
        name: existing?.name ?? name,
        count: (existing?.count ?? 0) + 1,
      })
    })
  })
  return [...detected.values()].sort(
    (a, b) =>
      b.count - a.count ||
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: 'base',
      }),
  )
}
