export type HostStatus = 'up' | 'down' | 'unknown'

export interface UsageSnapshot {
  collected_at: string
  console_users: number | null
  remote_users: number | null
  status: 'ok' | 'error'
  error: string | null
}

export interface Host {
  id: string
  address: string
  name: string
  groups: string[]
  metadata: Record<string, unknown>
  status: HostStatus
  icmp_enabled?: boolean
  usage_enabled?: boolean
  icmp_stale?: boolean
  usage_stale?: boolean
  last_checked_at: string | null
  last_change_at: string | null
  latency_ms: number | null
  consecutive_successes: number
  consecutive_failures: number
  last_error: string | null
  usage: UsageSnapshot | null
}

export interface Transition {
  id: number | null
  host_id: string
  previous_status: HostStatus
  new_status: HostStatus
  changed_at: string
  latency_ms: number | null
  error: string | null
  backend: string
  reason: string
}

export type ColumnKey =
  | 'host'
  | 'room'
  | 'address'
  | 'groups'
  | 'status'
  | 'since'
  | 'checked'
  | 'failures'
  | 'usage'

export interface ColumnDefinition {
  key: ColumnKey
  label: string
  align?: 'left' | 'right'
  required?: boolean
}

export type SortDirection = 'asc' | 'desc'

export interface SortState {
  key: ColumnKey
  direction: SortDirection
}

export interface FilterRule {
  id: string
  field: 'status' | 'room' | 'group' | 'name'
  operator: 'is' | 'is_not' | 'contains'
  value: string
}

export interface ConnectionSettings {
  token: string
  refreshSeconds: number
  demoMode: boolean
}
