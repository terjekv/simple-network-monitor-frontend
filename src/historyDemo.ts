import type { HistoryResponse, HistoryStats } from './historyTypes'
/** Explicit sample mode only. Never substitutes for absent or failed API history. */
export function demoSeries(
  from: number,
  to: number,
  groups: string[],
  byGroup: boolean,
): HistoryResponse {
  const count = 96,
    width = (to - from) / count
  const names = byGroup
    ? groups.length
      ? groups
      : ['core', 'workstations', 'services']
    : ['All selected hosts']
  return {
    from_ms: from,
    to_ms: to,
    resolution_seconds: Math.round(width / 1000),
    source_resolution_seconds: 300,
    available_from_ms: from,
    membership: 'at_observation_time',
    series: names.map((name, j) => ({
      id: name,
      label: name,
      buckets: Array.from({ length: count }, (_, i) => {
        const gap = i > 45 && i < 49,
          up = gap ? 0 : width * (i > 62 && i < 67 ? 0.86 : 0.995),
          latency =
            12 + Math.sin(i / 7 + j) * 5 + j * 8 + (i > 62 && i < 67 ? 22 : 0)
        const stats: HistoryStats = {
          samples: gap ? 0 : 60,
          successful_samples: gap ? 0 : 59,
          latency_count: gap ? 0 : 59,
          latency_sum_ms: latency * 59,
          latency_min_ms: latency / 2,
          latency_max_ms: latency * 2,
          latency_histogram: Array(17).fill(0),
          up_ms: up,
          down_ms: gap ? 0 : width - up,
          usage_observed_ms: gap ? 0 : width,
          console_user_ms: gap ? 0 : width * (0.6 + 0.3 * Math.sin(i / 12)),
          remote_user_ms: gap ? 0 : width * 0.15,
        }
        return {
          start_ms: Math.round(from + i * width),
          end_ms: Math.round(from + (i + 1) * width),
          eligible_ms: width,
          stats,
          latency_p95_ms: gap ? null : latency * 1.8,
        }
      }),
    })),
  }
}
