import { HistoryPanel } from './HistoryPanel'
import { useDialog } from './useDialog'
import { usageValue } from './model'
import {
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Copy,
  History,
  Laptop,
  LoaderCircle,
  Network,
  PanelRightClose,
  Radio,
  ShieldCheck,
  Sparkles,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react'
import { useState } from 'react'
import type { ConnectionSettings, Host, Transition } from './types'

import { getRoom, formatAge, statusLabel } from './model'
import { StatusDot } from './Common'
export function HostDrawer({
  host,
  settings,
  history,
  historyLoading,
  historyError,
  onRetry,
  onClose,
  onCopy,
}: {
  host: Host
  settings: ConnectionSettings
  history: Transition[]
  historyLoading: boolean
  historyError: string | null
  onRetry: () => void
  onClose: () => void
  onCopy: (value: string, label: string) => void
}) {
  const dialog = useDialog()
  const room = getRoom(host)
  const users = usageValue(host)

  return (
    <div
      className="drawer-layer"
      ref={dialog}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={`Details for ${host.name}`}
    >
      <button
        className="drawer-backdrop"
        aria-label="Close host details"
        onClick={onClose}
      />
      <aside className="host-drawer" aria-label={`Details for ${host.name}`}>
        <div className="drawer-header">
          <div className="drawer-host">
            <span className={`device-icon device-${host.status}`}>
              <Laptop size={20} />
            </span>
            <div>
              <div className="drawer-eyebrow">
                <StatusDot
                  status={host.status}
                  pulse={host.status === 'down'}
                />
                Last known: {statusLabel[host.status]} · {room}
              </div>
              <h2>{host.name}</h2>
            </div>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close details"
          >
            <PanelRightClose size={19} />
          </button>
        </div>

        <div className={`drawer-banner banner-${host.status}`}>
          <div>
            <strong>
              {host.icmp_enabled === false
                ? 'ICMP monitoring disabled'
                : host.icmp_stale
                  ? 'Observation is stale'
                  : host.status === 'down'
                    ? `Unreachable for ${formatAge(host.last_change_at)}`
                    : host.status === 'up'
                      ? 'Host is responding normally'
                      : 'Waiting for a reliable observation'}
            </strong>
            <span>
              {host.last_error ||
                (host.status === 'up'
                  ? 'Latest check completed successfully'
                  : 'No observation details available')}
            </span>
          </div>
          {host.status === 'down' ? <WifiOff size={22} /> : <Wifi size={22} />}
        </div>

        <div className="drawer-body">
          <HistoryPanel
            key={host.id}
            settings={settings}
            availableGroups={host.groups}
            hostId={host.id}
          />
          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Live state</span>
                <h3>At a glance</h3>
              </div>
              <span className="updated-label">
                Checked {formatAge(host.last_checked_at, true)}
              </span>
            </div>
            <div className="drawer-stat-grid">
              <div>
                <span>
                  {host.status === 'down'
                    ? 'Failed checks'
                    : 'Successful checks'}
                </span>
                <strong>
                  {host.status === 'down'
                    ? host.consecutive_failures
                    : host.consecutive_successes}
                </strong>
              </div>
              <div>
                <span>Active users</span>
                <strong>{users}</strong>
              </div>
            </div>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Identity</span>
                <h3>Host details</h3>
              </div>
            </div>
            <dl className="detail-list">
              <div>
                <dt>Address</dt>
                <dd>
                  <code>{host.address}</code>
                  <button
                    onClick={() => onCopy(host.address, 'IP address')}
                    aria-label="Copy IP address"
                  >
                    <Copy size={13} />
                  </button>
                </dd>
              </div>
              <div>
                <dt>Host ID</dt>
                <dd>
                  <code>{host.id}</code>
                  <button
                    onClick={() => onCopy(host.id, 'Host ID')}
                    aria-label="Copy host ID"
                  >
                    <Copy size={13} />
                  </button>
                </dd>
              </div>
              {Object.entries(host.metadata).map(([key, value]) => (
                <div key={key}>
                  <dt>{key.replace(/_/g, ' ')}</dt>
                  <dd>{value === null ? '—' : String(value)}</dd>
                </div>
              ))}
              <div>
                <dt>Groups</dt>
                <dd className="detail-tags">
                  {host.groups.map((group) => (
                    <span className="tag" key={group}>
                      {group}
                    </span>
                  ))}
                </dd>
              </div>
            </dl>
          </section>

          <section className="drawer-section">
            <div className="section-heading">
              <div>
                <span className="eyebrow">Status changes</span>
                <h3>Recent history</h3>
              </div>
              <History size={17} />
            </div>
            {historyLoading ? (
              <div className="history-loading">
                <LoaderCircle className="spin" size={17} /> Loading events
              </div>
            ) : historyError ? (
              <div role="alert">
                <p>{historyError}</p>
                <button className="button secondary" onClick={onRetry}>
                  Retry history
                </button>
              </div>
            ) : (
              <ol className="timeline">
                {history.map((event) => (
                  <li key={event.id ?? event.changed_at}>
                    <span
                      className={`timeline-marker marker-${event.new_status}`}
                    >
                      <StatusDot status={event.new_status} />
                    </span>
                    <div>
                      <strong>
                        {statusLabel[event.previous_status]} →{' '}
                        {statusLabel[event.new_status]}
                      </strong>
                      <span>{event.reason}</span>
                      {event.error && <small>{event.error}</small>}
                    </div>
                    <time dateTime={event.changed_at}>
                      {formatAge(event.changed_at)}
                    </time>
                  </li>
                ))}
                {!history.length && (
                  <li className="no-history">
                    No status changes have been recorded.
                  </li>
                )}
              </ol>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

export function SettingsModal({
  value,
  apiConfigured,
  onSave,
  onClose,
}: {
  value: ConnectionSettings
  apiConfigured: boolean
  onSave: (settings: ConnectionSettings) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState(value)
  const dialog = useDialog()

  return (
    <div
      ref={dialog}
      tabIndex={-1}
      className="modal-layer"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
    >
      <button
        className="modal-backdrop"
        onClick={onClose}
        aria-label="Close settings"
      />
      <div className="settings-modal">
        <div className="modal-header">
          <div>
            <span className="eyebrow">Data source</span>
            <h2 id="settings-title">Monitor connection</h2>
            <p>The frontend server securely relays requests to the monitor.</p>
          </div>
          <button
            className="icon-button"
            onClick={onClose}
            aria-label="Close settings"
          >
            <X size={18} />
          </button>
        </div>
        <div className="mode-picker">
          <button
            className={!draft.demoMode ? 'active' : ''}
            disabled={!apiConfigured}
            onClick={() => setDraft({ ...draft, demoMode: false })}
          >
            <Radio size={17} />
            <span>
              <strong>Live API</strong>
              <small>
                {apiConfigured
                  ? 'Proxied by the frontend'
                  : 'SNM_API_URL is not set'}
              </small>
            </span>
            {!draft.demoMode && <Check size={16} />}
          </button>
          <button
            className={draft.demoMode ? 'active' : ''}
            onClick={() => setDraft({ ...draft, demoMode: true })}
          >
            <Sparkles size={17} />
            <span>
              <strong>Demo data</strong>
              <small>Explore without a backend</small>
            </span>
            {draft.demoMode && <Check size={16} />}
          </button>
        </div>
        <div className="form-fields">
          <div className="proxy-source">
            <span className="proxy-source-icon">
              <Network size={17} />
            </span>
            <div>
              <strong>Server-managed endpoint</strong>
              <span>
                Browser <code>/snm-api</code> → frontend{' '}
                <code>SNM_API_URL</code>
              </span>
            </div>
            <span
              className={`proxy-status ${apiConfigured ? 'configured' : ''}`}
            >
              {apiConfigured ? 'Configured' : 'Not configured'}
            </span>
          </div>
          <label>
            <span>Access token</span>
            <div className="input-with-icon">
              <ShieldCheck size={16} />
              <input
                type="password"
                value={draft.token}
                disabled={draft.demoMode}
                onChange={(event) =>
                  setDraft({ ...draft, token: event.target.value })
                }
                placeholder="Enter the frontend or monitor access token"
              />
            </div>
          </label>
          <label>
            <span>Auto-refresh</span>
            <div className="select-wrap wide">
              <Clock3 size={16} />
              <select
                value={draft.refreshSeconds}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    refreshSeconds: Number(event.target.value),
                  })
                }
              >
                <option value={0}>Off</option>
                <option value={10}>Every 10 seconds</option>
                <option value={30}>Every 30 seconds</option>
                <option value={60}>Every minute</option>
                <option value={300}>Every 5 minutes</option>
              </select>
              <ChevronDown size={14} />
            </div>
          </label>
        </div>
        <div className="modal-note">
          <CircleHelp size={17} />
          <span>
            Preferences are saved in this browser. The access token stays in
            memory for this tab and is cleared when you reload or close it.
          </span>
        </div>
        <div className="modal-actions">
          <button className="button secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="button primary"
            onClick={() => onSave(draft)}
            disabled={!draft.demoMode && !apiConfigured}
          >
            <Check size={16} />
            Save & connect
          </button>
        </div>
      </div>
    </div>
  )
}
