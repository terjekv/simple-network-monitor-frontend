import { useMemo, useState } from 'react'
import { validateEvents, validateSeries } from './api'
import type { ConnectionSettings } from './types'
import type {
  HistoryMetric,
  HistoryEvents,
  HistoryResponse,
} from './historyTypes'
import { useMonitorData } from './useMonitorData'
import { HistoryChart } from './HistoryChart'
import { demoSeries } from './historyDemo'
import { historyCoverage, historyValue, metricNames } from './model'
const ranges = [
  ['24 hours', 1],
  ['7 days', 7],
  ['30 days', 30],
  ['1 year', 365],
  ['3 years', 1095],
] as const
const noEvents: HistoryEvents = { events: [], next_before: null }
const stamp = (n: number) => new Date(n).toLocaleString()
export function HistoryPanel({
  settings,
  availableGroups,
  hostId,
  initialGroup,
}: {
  settings: ConnectionSettings
  availableGroups: string[]
  hostId?: string
  initialGroup?: string | null
}) {
  const [days, setDays] = useState(1)
  const [end, setEnd] = useState(() => Date.now())
  const [custom, setCustom] = useState(false)
  const [fromInput, setFromInput] = useState(''),
    [toInput, setToInput] = useState('')
  const [groups, setGroups] = useState<string[]>(
    initialGroup ? [initialGroup] : [],
  )
  const [historicalGroup, setHistoricalGroup] = useState('')
  const [breakdown, setBreakdown] = useState('all')
  const [metric, setMetric] = useState<HistoryMetric>('availability')
  const [module, setModule] = useState('icmp')
  const [check, setCheck] = useState('')
  const from = custom ? Date.parse(fromInput + 'Z') : end - days * 86400000,
    to = custom ? Date.parse(toInput + 'Z') : end
  const valid =
    Number.isFinite(from) &&
    Number.isFinite(to) &&
    to > from &&
    from >= 0 &&
    to <= Date.now() + 60000
  // A fixed end makes pagination stable; "Latest" advances it deliberately.
  const params = new URLSearchParams({
    from: String(valid ? from : 0),
    to: String(valid ? to : 1),
    module: metric === 'users' ? 'usage' : module,
    breakdown,
    max_points: '288',
  })
  if (groups.length) params.set('groups', groups.join(','))
  if (hostId) params.set('hosts', hostId)
  if (module === 'tcp' && check && metric !== 'users')
    params.set('check', check)
  const demo = useMemo(
    () => (valid ? demoSeries(from, to, groups, breakdown === 'group') : null),
    [valid, from, to, groups, breakdown],
  )
  const result = useMonitorData(
    settings,
    `/v1/history?${params}`,
    validateSeries,
    demo,
  )
  return (
    <section
      className={`history-panel ${hostId ? 'host-history-panel' : ''}`}
      aria-label="Historical trends"
    >
      <div className="history-heading">
        <div>
          <span className="eyebrow">
            {hostId ? 'Host history' : 'Historical perspective'}
          </span>
          <h2>{hostId ? 'Trends over time' : 'The network, over time'}</h2>
        </div>
        <button
          className="button secondary compact"
          onClick={() => {
            setEnd(Date.now())
            setCustom(false)
            result.retry()
          }}
        >
          Latest
        </button>
      </div>
      <div className="history-controls">
        <div className="segmented" aria-label="History range">
          {ranges.map(([name, value]) => (
            <button
              key={value}
              aria-pressed={!custom && days === value}
              onClick={() => {
                setDays(value)
                setCustom(false)
                setEnd(Date.now())
              }}
            >
              {name}
            </button>
          ))}
          <button
            aria-pressed={custom}
            onClick={() => {
              setFromInput(
                new Date(end - days * 86400000).toISOString().slice(0, 16),
              )
              setToInput(new Date(end).toISOString().slice(0, 16))
              setCustom(true)
            }}
          >
            Custom
          </button>
        </div>
        <label>
          Metric
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value as HistoryMetric)}
          >
            {Object.entries(metricNames).map(([value, name]) => (
              <option key={value} value={value}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {metric !== 'users' && (
          <label>
            Check type
            <select value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="icmp">ICMP</option>
              <option value="tcp">TCP</option>
            </select>
          </label>
        )}
        {module === 'tcp' && metric !== 'users' && (
          <label>
            Check ID
            <input
              value={check}
              placeholder="All TCP checks"
              onChange={(e) => setCheck(e.target.value)}
            />
          </label>
        )}
      </div>
      {custom && (
        <div className="history-controls">
          <label>
            From (UTC)
            <input
              type="datetime-local"
              value={fromInput}
              onChange={(e) => setFromInput(e.target.value)}
            />
          </label>
          <label>
            To (UTC)
            <input
              type="datetime-local"
              value={toInput}
              onChange={(e) => setToInput(e.target.value)}
            />
          </label>
        </div>
      )}
      {!hostId && (
        <div className="scope-row">
          <details>
            <summary>
              {groups.length
                ? `${groups.length} selected groups`
                : 'All groups'}{' '}
              <span>⌄</span>
            </summary>
            <div className="scope-picker">
              {[...new Set([...availableGroups, ...groups])].map((g) => (
                <label key={g}>
                  <input
                    type="checkbox"
                    checked={groups.includes(g)}
                    disabled={groups.length >= 16 && !groups.includes(g)}
                    onChange={() =>
                      setGroups((previous) =>
                        previous.includes(g)
                          ? previous.filter((v) => v !== g)
                          : [...previous, g],
                      )
                    }
                  />
                  {g}
                </label>
              ))}
              <label>
                Historical group
                <input
                  placeholder="Group name"
                  value={historicalGroup}
                  onChange={(e) => setHistoricalGroup(e.target.value)}
                />
              </label>
              <button
                className="button secondary compact"
                disabled={!historicalGroup.trim() || groups.length >= 16}
                onClick={() => {
                  setGroups([...new Set([...groups, historicalGroup.trim()])])
                  setHistoricalGroup('')
                }}
              >
                Add group
              </button>
              <button className="clear-link" onClick={() => setGroups([])}>
                Clear selection
              </button>
            </div>
          </details>
          <div className="segmented">
            <button
              aria-pressed={breakdown === 'all'}
              onClick={() => setBreakdown('all')}
            >
              Combined
            </button>
            <button
              aria-pressed={breakdown === 'group'}
              onClick={() => setBreakdown('group')}
            >
              By group
            </button>
          </div>
          <span className="history-note">
            Historical membership · combined hosts counted once
          </span>
        </div>
      )}
      {settings.demoMode && (
        <p className="demo-history-note">Illustrative history · sample mode</p>
      )}
      {!valid ? (
        <p role="alert">Choose a valid time range ending no later than now.</p>
      ) : (
        <>
          {result.error && (
            <div className="history-error" role="alert">
              {result.data ? 'Showing previous data. ' : ''}
              {result.error}{' '}
              <button className="clear-link" onClick={result.retry}>
                Retry charts
              </button>
            </div>
          )}
          {result.loading ? (
            <p className="history-placeholder">
              Loading historical observations…
            </p>
          ) : (
            result.data && (
              <>
                <PeriodSummary data={result.data} usage={metric === 'users'} />
                <HistoryChart data={result.data} metric={metric} />
                {breakdown === 'group' && (
                  <div className="group-history">
                    {result.data.series.map((s) => (
                      <div key={s.id}>
                        <strong>{s.label}</strong>
                        <div
                          className="availability-strip"
                          aria-label={`${s.label} coverage and availability`}
                        >
                          {s.buckets.map((b) => (
                            <span
                              key={b.start_ms}
                              title={`${stamp(b.start_ms)} · ${historyValue(b, 'availability')?.toFixed(1) ?? 'Unknown'}% availability · ${historyCoverage(b).toFixed(0)}% coverage`}
                              style={{
                                background:
                                  !b.stats.up_ms && !b.stats.down_ms
                                    ? 'var(--line)'
                                    : historyValue(b, 'availability')! < 95
                                      ? 'var(--danger)'
                                      : historyCoverage(b) < 90
                                        ? 'var(--warning)'
                                        : 'var(--accent)',
                              }}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <p className="history-note">
                  Window ends {stamp(result.data.to_ms)} ·{' '}
                  {Math.round(result.data.resolution_seconds / 60)} min per
                  point · source{' '}
                  {Math.round(result.data.source_resolution_seconds / 60)} min ·{' '}
                  {result.data.available_from_ms
                    ? `Tracking since ${stamp(result.data.available_from_ms)}`
                    : 'No recorded history yet'}
                  . Unknown intervals are excluded from availability and shown
                  as gaps. P95 uses histogram estimates.
                </p>
              </>
            )
          )}
          {!hostId && (
            <EventList
              key={params.toString()}
              settings={settings}
              query={params.toString()}
            />
          )}
        </>
      )}
    </section>
  )
}
function PeriodSummary({
  data,
  usage,
}: {
  data: HistoryResponse
  usage: boolean
}) {
  // Group comparisons overlap by design: show individual summaries rather than adding groups together.
  return (
    <div className="period-summary">
      {data.series.map((s) => {
        const sums = s.buckets.reduce(
          (a, b) => ({
            users: a.users + b.stats.console_user_ms + b.stats.remote_user_ms,
            observed: a.observed + b.stats.usage_observed_ms,
            up: a.up + b.stats.up_ms,
            down: a.down + b.stats.down_ms,
            eligible: a.eligible + b.eligible_ms,
            count: a.count + b.stats.latency_count,
            latency: a.latency + b.stats.latency_sum_ms,
          }),
          {
            users: 0,
            observed: 0,
            up: 0,
            down: 0,
            eligible: 0,
            count: 0,
            latency: 0,
          },
        )
        return (
          <div key={s.id}>
            <span>{s.label}</span>
            <strong>
              {usage
                ? sums.observed
                  ? (sums.users / sums.observed).toFixed(2)
                  : '—'
                : sums.up + sums.down
                  ? `${((100 * sums.up) / (sums.up + sums.down)).toFixed(2)}%`
                  : '—'}{' '}
              <small>{usage ? 'users / observed host' : 'available'}</small>
            </strong>
            <p>
              {usage
                ? 'Duration weighted'
                : sums.count
                  ? `${(sums.latency / sums.count).toFixed(1)} ms mean`
                  : 'Latency unavailable'}{' '}
              <span>·</span>{' '}
              {sums.eligible
                ? (
                    (100 * (usage ? sums.observed : sums.up + sums.down)) /
                    sums.eligible
                  ).toFixed(1)
                : '0'}
              % coverage
            </p>
          </div>
        )
      })}
    </div>
  )
}
function EventList({
  settings,
  query,
}: {
  settings: ConnectionSettings
  query: string
}) {
  const [cursor, setCursor] = useState<number | null>(null),
    [previous, setPrevious] = useState<HistoryEvents['events']>([])
  const result = useMonitorData(
    settings,
    `/v1/history/events?${query}&limit=30${cursor ? `&before=${cursor}` : ''}`,
    validateEvents,
    noEvents,
  )
  const events = [
    ...new Map(
      [...previous, ...(result.data?.events ?? [])].map((e) => [e.id, e]),
    ).values(),
  ]
  return (
    <div className="event-history">
      <div className="history-heading">
        <h3>Observed changes</h3>
        <span className="history-note">Newest collected first</span>
      </div>
      {result.error && (
        <p role="alert">
          {result.error} <button onClick={result.retry}>Retry events</button>
        </p>
      )}
      {events.length ? (
        <ol>
          {events.map((e) => (
            <li key={e.id}>
              <span className={`event-state event-${e.observation.state}`}>
                {e.observation.state}
              </span>
              <div>
                <strong>{e.name}</strong>
                <p>
                  {e.check_id ? `${e.check_id} · ` : ''}
                  {e.previous_state ? `${e.previous_state} → ` : ''}
                  {e.observation.state}
                  {e.observation.console_users !== null
                    ? ` · ${e.observation.console_users} console / ${e.observation.remote_users} remote users`
                    : ''}
                  {e.observation.error ? ` · ${e.observation.error}` : ''}
                </p>
              </div>
              <time>{stamp(e.at_ms)}</time>
            </li>
          ))}
        </ol>
      ) : (
        <p className="history-note">
          {result.loading
            ? 'Loading changes…'
            : settings.demoMode
              ? 'Live changes appear when connected to a monitor.'
              : 'No observed changes in this window.'}
        </p>
      )}
      {result.data?.next_before && (
        <button
          className="button secondary compact"
          onClick={() => {
            setPrevious(events)
            setCursor(result.data!.next_before)
          }}
        >
          Load older changes
        </button>
      )}
    </div>
  )
}
