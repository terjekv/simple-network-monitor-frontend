import {
  Building2,
  ChevronRight,
  Clipboard,
  EyeOff,
  Laptop,
  Server,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import type { ColumnDefinition, ColumnKey, Host, SortState } from './types'

import {
  getRoom,
  formatAge,
  plural,
  groupHosts,
  usageValue,
  effectiveStatus,
} from './model'
import type { GroupMode } from './model'
import { StatusPill, SortIcon, SkeletonRows, EmptyState } from './Common'
interface Props {
  hosts: Host[]
  loading: boolean
  activeColumns: ColumnDefinition[]
  sort: SortState
  groupMode: GroupMode
  clearFilters: () => void
  applySort: (key: ColumnKey) => void
  toggleSkippedRoom: (room: string) => void
  setToast: (message: string) => void
  setSelectedHostId: (id: string | null) => void
  copy: (value: string, label: string) => void
}
export function HostTable({
  hosts: filteredHosts,
  loading,
  activeColumns,
  sort,
  groupMode,
  clearFilters,
  applySort,
  toggleSkippedRoom,
  setToast,
  setSelectedHostId,
  copy,
}: Props) {
  const [requestedPage, setPage] = useState(0)
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(filteredHosts.length / 100) - 1),
  )
  const groups = useMemo(
    () =>
      groupHosts(
        filteredHosts.slice(page * 100, (page + 1) * 100),
        groupMode,
        sort,
      ),
    [filteredHosts, page, groupMode, sort],
  )
  const renderCell = (host: Host, key: ColumnKey) => {
    switch (key) {
      case 'host':
        return (
          <div className="host-cell">
            <span className={`device-icon device-${host.status}`}>
              {host.groups.includes('routers') ||
              host.groups.includes('network') ? (
                <Server size={17} />
              ) : (
                <Laptop size={17} />
              )}
            </span>
            <div>
              <strong>{host.name}</strong>
              <span>{host.id}</span>
            </div>
          </div>
        )
      case 'room':
        return <span className="room-value">{getRoom(host)}</span>
      case 'address':
        return <code>{host.address}</code>
      case 'groups':
        return (
          <div className="table-tags">
            {host.groups.slice(0, 2).map((group) => (
              <span className="tag" key={group}>
                {group}
              </span>
            ))}
            {host.groups.length > 2 && (
              <span className="tag tag-more">+{host.groups.length - 2}</span>
            )}
          </div>
        )
      case 'status':
        return (
          <>
            <StatusPill status={effectiveStatus(host)} />
            {host.icmp_enabled === false ? (
              <small> Disabled</small>
            ) : host.icmp_stale ? (
              <small> Stale</small>
            ) : null}
          </>
        )
      case 'since':
        return (
          <span
            className={`age-value${effectiveStatus(host) === 'down' ? ' age-danger' : ''}`}
          >
            {formatAge(host.last_change_at)}
          </span>
        )
      case 'checked':
        return (
          <span className="muted-value">{formatAge(host.last_checked_at)}</span>
        )
      case 'failures':
        return (
          <span
            className={`number-value${host.consecutive_failures ? ' fail-value' : ''}`}
          >
            {host.consecutive_failures || '—'}
          </span>
        )
      case 'usage': {
        const users = usageValue(host)
        return <span className="number-value">{users}</span>
      }
    }
  }

  return (
    <>
      <div className="table-wrap">
        {loading ? (
          <SkeletonRows />
        ) : filteredHosts.length === 0 ? (
          <EmptyState clear={clearFilters} />
        ) : (
          <table>
            <thead>
              <tr>
                {activeColumns.map((column) => (
                  <th
                    key={column.key}
                    className={column.align === 'right' ? 'cell-right' : ''}
                    aria-sort={
                      sort.key === column.key
                        ? sort.direction === 'asc'
                          ? 'ascending'
                          : 'descending'
                        : 'none'
                    }
                  >
                    <button onClick={() => applySort(column.key)}>
                      {column.label}
                      <SortIcon column={column.key} sort={sort} />
                    </button>
                  </th>
                ))}
                <th className="row-actions-head" aria-label="Row actions" />
              </tr>
            </thead>
            {groups.map(([room, roomHosts]) => {
              const down = roomHosts.filter(
                (host) => effectiveStatus(host) === 'down',
              ).length
              const unknown = roomHosts.filter(
                (host) => effectiveStatus(host) === 'unknown',
              ).length
              return (
                <tbody key={room}>
                  {groupMode === 'room' && (
                    <tr className="group-row">
                      <td colSpan={activeColumns.length + 1}>
                        <div>
                          <span className="group-icon">
                            <Building2 size={14} />
                          </span>
                          <strong>{room}</strong>
                          <span>{plural(roomHosts.length, 'host')}</span>
                        </div>
                        <div>
                          {down > 0 && (
                            <span className="group-down">
                              {plural(down, 'offline')}
                            </span>
                          )}
                          {unknown > 0 && (
                            <span className="group-unknown">
                              {plural(unknown, 'unknown')}
                            </span>
                          )}
                          {room !== 'No room' && (
                            <button
                              className="skip-room-action"
                              onClick={() => {
                                toggleSkippedRoom(room)
                                setToast(`${room} skipped`)
                              }}
                              aria-label={`Skip ${room}`}
                              title={`Skip ${room}`}
                            >
                              <EyeOff size={12} />
                              <span>Skip</span>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  {roomHosts.map((host) => (
                    <tr
                      className="host-row"
                      key={host.id}
                      tabIndex={0}
                      onClick={() => setSelectedHostId(host.id)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault()
                          setSelectedHostId(host.id)
                        }
                      }}
                    >
                      {activeColumns.map((column) => (
                        <td
                          key={column.key}
                          className={
                            column.align === 'right' ? 'cell-right' : ''
                          }
                        >
                          {renderCell(host, column.key)}
                        </td>
                      ))}
                      <td className="row-actions">
                        <button
                          aria-label={`Copy ${host.name}`}
                          title="Copy host name"
                          onClick={(event) => {
                            event.stopPropagation()
                            void copy(host.name, 'Host name')
                          }}
                        >
                          <Clipboard size={14} />
                        </button>
                        <button aria-label={`Open ${host.name}`}>
                          <ChevronRight size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              )
            })}
          </table>
        )}
      </div>

      <nav className="table-footer" aria-label="Host pages">
        <button
          className="button secondary"
          disabled={page === 0}
          onClick={() => setPage(page - 1)}
        >
          Previous page
        </button>
        <span>
          {filteredHosts.length ? page * 100 + 1 : 0}–
          {Math.min((page + 1) * 100, filteredHosts.length)} of{' '}
          {filteredHosts.length} hosts
        </span>
        <button
          className="button secondary"
          disabled={(page + 1) * 100 >= filteredHosts.length}
          onClick={() => setPage(page + 1)}
        >
          Next page
        </button>
      </nav>
    </>
  )
}
