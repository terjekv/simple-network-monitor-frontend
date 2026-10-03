import { validateMaintenance } from './api'
import { useMonitorData } from './useMonitorData'
import type { ConnectionSettings } from './types'
const bytes = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`
const at = (n: number | null) =>
  n === null ? 'Not yet' : new Date(n).toLocaleString()
export function MaintenancePanel({
  settings,
}: {
  settings: ConnectionSettings
}) {
  const result = useMonitorData(
    settings,
    '/v1/system/maintenance',
    validateMaintenance,
    null,
  )
  return (
    <section className="history-panel" aria-label="Database maintenance">
      <div className="history-heading">
        <div>
          <span className="eyebrow">System health</span>
          <h2>Database & maintenance</h2>
        </div>
        <button className="button secondary" onClick={result.retry}>
          Refresh maintenance
        </button>
      </div>
      <p className="history-note">
        Scheduled within the monitor service. Jobs run one at a time in bounded
        batches and retry after failures.
      </p>
      {settings.demoMode ? (
        <p className="history-placeholder">
          Connect to a live monitor to see its database and maintenance status.
        </p>
      ) : result.loading ? (
        <p>Loading maintenance status…</p>
      ) : result.error ? (
        <p role="alert">{result.error}</p>
      ) : (
        result.data && (
          <>
            <div className="database-metrics">
              {[
                ['Database', bytes(result.data.database.allocated_bytes)],
                ['Reusable space', bytes(result.data.database.reusable_bytes)],
                ['WAL', bytes(result.data.database.wal_bytes)],
                [
                  'Queued duration spans',
                  result.data.database.pending_spans.toLocaleString(),
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
            <p className="maintenance-mode">
              {result.data.database.incremental_vacuum
                ? 'Incremental space reclamation enabled'
                : 'Setup needed: stop the service and run --compact-database to enable incremental reclamation.'}
            </p>
            {result.data.database.oldest_pending_ms !== null && (
              <p className="history-note">
                Oldest queued span: {at(result.data.database.oldest_pending_ms)}
                . Pending spans are included in chart queries.
              </p>
            )}
            <div className="maintenance-table">
              <table>
                <thead>
                  <tr>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Last success</th>
                    <th>Next run</th>
                    <th>Duration</th>
                    <th>Work units</th>
                  </tr>
                </thead>
                <tbody>
                  {result.data.jobs.map((j) => (
                    <tr key={j.id}>
                      <th>
                        {j.id.replaceAll('_', ' ')}
                        {j.message && <small>{j.message}</small>}
                      </th>
                      <td>
                        <span className={`job-status job-${j.status}`}>
                          {j.status}
                        </span>
                        {j.failures > 0 && <small>{j.failures} failures</small>}
                      </td>
                      <td>{at(j.last_success_ms)}</td>
                      <td>{at(j.next_run_ms)}</td>
                      <td>
                        {j.duration_ms === null ? '—' : `${j.duration_ms} ms`}
                      </td>
                      <td>{j.work_done}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="history-note">
              Work units are span segments for rollup, rows for cleanup, and
              pages for reclamation/checkpoints. Full file compaction is an
              explicit offline operation.
            </p>
          </>
        )
      )}
    </section>
  )
}
