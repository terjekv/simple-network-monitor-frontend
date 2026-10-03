import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { HistoryChart } from './HistoryChart'
import { historyCoverage, historyValue } from './model'
import { validateSeries, validateEvents, validateMaintenance } from './api'
import { demoSeries } from './historyDemo'
afterEach(cleanup)
it('keeps unknown coverage separate from downtime and latency zero', () => {
  const b = demoSeries(0, 300000, [], false).series[0].buckets[0]
  b.eligible_ms = 10000
  b.stats.up_ms = 2000
  b.stats.down_ms = 2000
  expect(historyValue(b, 'availability')).toBe(50)
  expect(historyCoverage(b)).toBe(40)
  b.stats.up_ms = 0
  b.stats.down_ms = 0
  b.stats.latency_count = 0
  b.latency_p95_ms = null
  expect(historyValue(b, 'availability')).toBeNull()
  expect(historyValue(b, 'latency')).toBeNull()
  expect(historyValue(b, 'p95')).toBeNull()
})
it('draws disconnected paths across unknown intervals and offers an accessible data table', () => {
  const data = demoSeries(0, 300000, [], false)
  data.series[0].buckets = data.series[0].buckets.slice(0, 3)
  data.series[0].buckets[1].stats.up_ms = 0
  data.series[0].buckets[1].stats.down_ms = 0
  const { container } = render(
    <HistoryChart data={data} metric="availability" />,
  )
  expect(
    container.querySelector('svg path')?.getAttribute('d')?.match(/M/g),
  ).toHaveLength(2)
  fireEvent.click(screen.getByRole('button', { name: 'Show chart data table' }))
  expect(screen.getByRole('table')).toBeVisible()
  expect(screen.getByRole('cell', { name: 'No observation' })).toBeVisible()
  fireEvent.change(screen.getByRole('slider', { name: 'Inspect chart time' }), {
    target: { value: '1' },
  })
  expect(screen.getAllByText(/0% coverage/).length).toBeGreaterThan(0)
})
it('rejects malformed API history and operational status', () => {
  const data = demoSeries(0, 300000, [], false)
  expect(validateSeries(data).series).toHaveLength(1)
  data.series[0].buckets[0].stats.up_ms = NaN
  expect(() => validateSeries(data)).toThrow('invalid chart data')
  expect(() =>
    validateEvents({ events: [{ id: 1 }], next_before: null }),
  ).toThrow('invalid event data')
  expect(() => validateMaintenance({ database: {}, jobs: [] })).toThrow(
    'invalid maintenance data',
  )
})
