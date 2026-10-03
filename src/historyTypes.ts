export interface HistoryStats {
  samples: number
  successful_samples: number
  latency_count: number
  latency_sum_ms: number
  latency_min_ms: number | null
  latency_max_ms: number | null
  latency_histogram: number[]
  up_ms: number
  down_ms: number
  usage_observed_ms: number
  console_user_ms: number
  remote_user_ms: number
}
export interface HistoryBucket {
  start_ms: number
  end_ms: number
  eligible_ms: number
  stats: HistoryStats
  latency_p95_ms: number | null
}
export interface HistorySeries {
  id: string
  label: string
  buckets: HistoryBucket[]
}
export interface HistoryResponse {
  from_ms: number
  to_ms: number
  resolution_seconds: number
  source_resolution_seconds: number
  available_from_ms: number | null
  membership: string
  series: HistorySeries[]
}
export interface HistoryEvent {
  id: number
  host_id: string
  name: string
  groups: string[]
  module: string
  check_id: string
  at_ms: number
  previous_state: string | null
  observation: {
    state: string
    success: boolean
    latency_ms: number | null
    console_users: number | null
    remote_users: number | null
    error: string | null
  }
}
export interface HistoryEvents {
  events: HistoryEvent[]
  next_before: number | null
}
export interface MaintenanceStatus {
  database: {
    allocated_bytes: number
    reusable_bytes: number
    wal_bytes: number
    incremental_vacuum: boolean
    pending_spans: number
    oldest_pending_ms: number | null
  }
  jobs: {
    id: string
    status: string
    last_started_ms: number | null
    last_success_ms: number | null
    next_run_ms: number
    duration_ms: number | null
    work_done: number
    failures: number
    message: string | null
  }[]
}
export type HistoryMetric = 'availability' | 'latency' | 'p95' | 'users'
