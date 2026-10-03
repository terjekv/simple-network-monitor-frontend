import { useEffect, useRef, useState } from 'react'
import type { HistoryMetric, HistoryResponse } from './historyTypes'
import { historyValue, historyCoverage, metricNames } from './model'
const chartColors = [
  '#496cdb',
  '#b88028',
  '#9d5fa3',
  '#ce6260',
  '#728647',
  '#727a8c',
  '#506ca0',
  '#ab7148',
]

const valueLabel = (n: number | null, metric: HistoryMetric) =>
  n === null
    ? 'No observation'
    : `${n.toFixed(metric === 'users' ? 2 : 1)}${metric === 'availability' ? '%' : metric === 'users' ? '' : ' ms'}`
export function HistoryChart({
  data,
  metric,
}: {
  data: HistoryResponse
  metric: HistoryMetric
}) {
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(980)
  useEffect(() => {
    if (!container.current || typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) =>
      setWidth(Math.max(280, entry.contentRect.width)),
    )
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  const plotWidth = width - 78
  const timeTicks = width < 600 ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1]
  const [hidden, setHidden] = useState<string[]>([])
  const [point, setPoint] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const shown = data.series.filter((s) => !hidden.includes(s.id))
  const values = shown
    .flatMap((s) => s.buckets.map((b) => historyValue(b, metric)))
    .filter((n): n is number => n !== null)
  const max = metric === 'availability' ? 100 : Math.max(1, ...values) * 1.15
  const length = data.series[0]?.buckets.length ?? 0
  const x = (i: number) =>
    58 + (length <= 1 ? 0.5 : i / (length - 1)) * plotWidth
  const y = (n: number) => 220 - (n / max) * 185
  const selected = point === null ? null : data.series[0]?.buckets[point]
  return (
    <div className="history-chart" ref={container}>
      <div className="chart-legend">
        {data.series.map((s, i) => (
          <button
            key={s.id}
            aria-pressed={!hidden.includes(s.id)}
            onClick={() =>
              setHidden((h) =>
                h.includes(s.id) ? h.filter((id) => id !== s.id) : [...h, s.id],
              )
            }
          >
            <span style={{ background: chartColors[i % chartColors.length] }} />
            {s.label}
          </button>
        ))}
      </div>
      {!values.length && (
        <p className="chart-empty">
          No observations in this window. Gaps stay empty until checks are
          collected.
        </p>
      )}
      <svg
        viewBox={`0 0 ${width} 270`}
        role="img"
        aria-label={`${metricNames[metric]} history. Gaps indicate missing observations. Use the time slider or data table for values.`}
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect()
          setPoint(
            Math.max(
              0,
              Math.min(
                length - 1,
                Math.round(
                  ((((e.clientX - box.left) / box.width) * width - 58) /
                    plotWidth) *
                    (length - 1),
                ),
              ),
            ),
          )
        }}
        onPointerLeave={() => setPoint(null)}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1="58"
              x2={width - 20}
              y1={y(f * max)}
              y2={y(f * max)}
              className="chart-grid"
            />
            <text x="46" y={y(f * max) + 4} textAnchor="end">
              {(f * max).toFixed(max > 10 ? 0 : 1)}
              {metric === 'availability' ? '%' : ''}
            </text>
          </g>
        ))}
        {shown.map((s) => {
          let open = false
          const path = s.buckets
            .map((b, i) => {
              const n = historyValue(b, metric)
              if (n === null) {
                open = false
                return ''
              }
              const segment = `${open ? 'L' : 'M'}${x(i).toFixed(2)},${y(n).toFixed(2)}`
              open = true
              return segment
            })
            .join(' ')
          const color = chartColors[data.series.indexOf(s) % chartColors.length]
          return (
            <g key={s.id}>
              <path
                d={path}
                fill="none"
                stroke={color}
                strokeWidth="2.4"
                vectorEffect="non-scaling-stroke"
              />
              {s.buckets.map((b, i) => {
                const n = historyValue(b, metric)
                return n !== null && (length < 40 || i === point) ? (
                  <circle
                    key={b.start_ms}
                    cx={x(i)}
                    cy={y(n)}
                    r={i === point ? 4 : 2}
                    fill={color}
                  />
                ) : null
              })}
            </g>
          )
        })}
        {point !== null && length > 0 && (
          <line
            x1={x(point)}
            x2={x(point)}
            y1="26"
            y2="222"
            className="chart-cursor"
          />
        )}
        {timeTicks.map((f) => (
          <text
            key={f}
            x={58 + plotWidth * f}
            y="252"
            textAnchor={f === 0 ? 'start' : f === 1 ? 'end' : 'middle'}
          >
            {new Date(
              data.from_ms + (data.to_ms - data.from_ms) * f,
            ).toLocaleString(undefined, {
              ...(width > 600 || data.to_ms - data.from_ms >= 172800000
                ? { month: 'short' as const, day: 'numeric' as const }
                : {}),
              ...(data.to_ms - data.from_ms < 172800000
                ? { hour: '2-digit', minute: '2-digit' }
                : {}),
            })}
          </text>
        ))}
      </svg>
      {length > 0 && (
        <input
          className="chart-scrubber"
          type="range"
          aria-label="Inspect chart time"
          min="0"
          max={length - 1}
          value={point ?? length - 1}
          onChange={(e) => setPoint(Number(e.target.value))}
        />
      )}
      <div className="chart-readout" aria-live="polite">
        {selected ? (
          <>
            <time>{new Date(selected.start_ms).toLocaleString()}</time>
            {shown.map((s) => (
              <span key={s.id}>
                {s.label}:{' '}
                <b>
                  {valueLabel(historyValue(s.buckets[point!], metric), metric)}
                </b>{' '}
                ·{' '}
                {historyCoverage(s.buckets[point!], metric === 'users').toFixed(
                  0,
                )}
                % coverage
              </span>
            ))}
          </>
        ) : (
          <span>
            Move over the graph or use the slider to inspect a time bucket.
          </span>
        )}
      </div>
      <button className="clear-link" onClick={() => setTable(!table)}>
        {table ? 'Hide' : 'Show'} chart data table
      </button>
      {table && (
        <div className="chart-table">
          <table>
            <caption>{metricNames[metric]} · local time</caption>
            <thead>
              <tr>
                <th>Time</th>
                {shown.map((s) => (
                  <th key={s.id}>{s.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.series[0]?.buckets.map((b, i) => (
                <tr key={b.start_ms}>
                  <th>{new Date(b.start_ms).toLocaleString()}</th>
                  {shown.map((s) => (
                    <td key={s.id}>
                      {valueLabel(historyValue(s.buckets[i], metric), metric)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
