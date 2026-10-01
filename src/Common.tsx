import {
  ArrowDown,
  ArrowDownUp,
  ArrowUp,
  ChevronRight,
  RotateCcw,
  Search,
} from 'lucide-react'
import type { ColumnKey, HostStatus, SortState } from './types'

import { statusLabel } from './model'
export function StatusDot({
  status,
  pulse = false,
}: {
  status: HostStatus
  pulse?: boolean
}) {
  return (
    <span
      className={`status-dot status-${status}${pulse ? ' status-pulse' : ''}`}
      aria-hidden="true"
    />
  )
}

export function StatusPill({ status }: { status: HostStatus }) {
  return (
    <span className={`status-pill pill-${status}`}>
      <StatusDot status={status} pulse={status === 'down'} />
      {statusLabel[status]}
    </span>
  )
}

export function SortIcon({
  column,
  sort,
}: {
  column: ColumnKey
  sort: SortState
}) {
  if (sort.key !== column)
    return <ArrowDownUp size={13} className="sort-idle" />
  return sort.direction === 'asc' ? (
    <ArrowUp size={13} />
  ) : (
    <ArrowDown size={13} />
  )
}

export function MetricCard({
  label,
  value,
  detail,
  tone,
  icon,
  active,
  onClick,
}: {
  label: string
  value: string | number
  detail: string
  tone: 'neutral' | 'success' | 'danger' | 'warning'
  icon: React.ReactNode
  active?: boolean
  onClick?: () => void
}) {
  return (
    <button
      className={`metric-card metric-${tone}${active ? ' metric-active' : ''}`}
      onClick={onClick}
    >
      <span className="metric-icon">{icon}</span>
      <span className="metric-content">
        <span className="metric-label">{label}</span>
        <span className="metric-value">{value}</span>
        <span className="metric-detail">{detail}</span>
      </span>
      {onClick && <ChevronRight size={16} className="metric-chevron" />}
    </button>
  )
}

export function EmptyState({ clear }: { clear: () => void }) {
  return (
    <div className="empty-state">
      <span className="empty-icon">
        <Search size={24} />
      </span>
      <h3>No hosts match this view</h3>
      <p>Try a different search or remove one of the active filters.</p>
      <button className="button secondary" onClick={clear}>
        <RotateCcw size={15} />
        Clear filters
      </button>
    </div>
  )
}

export function SkeletonRows() {
  return (
    <div className="skeleton-wrap">
      {[0, 1, 2, 3, 4].map((item) => (
        <div className="skeleton-row" key={item}>
          <span />
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  )
}
