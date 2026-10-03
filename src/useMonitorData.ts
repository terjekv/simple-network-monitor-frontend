import { useEffect, useState } from 'react'
import { fetchMonitorData } from './api'
import type { ConnectionSettings } from './types'

/** Cancel on scope/auth changes; pause hidden tabs, keep stale data explicit, back off failures. */
export function useMonitorData<T>(
  settings: ConnectionSettings,
  path: string,
  validate: (value: unknown) => T,
  demo: T | null,
) {
  const [result, setResult] = useState<{
    data: T | null
    error: string | null
    loading: boolean
  }>({ data: null, error: null, loading: true })
  const [revision, retry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    let timer: number | undefined
    let pending = false,
      failures = 0
    setResult({ data: null, error: null, loading: true })
    async function load() {
      if (pending || controller.signal.aborted) return
      pending = true
      try {
        const data = settings.demoMode
          ? demo
          : await fetchMonitorData(settings, path, validate, controller.signal)
        if (!controller.signal.aborted) {
          setResult({ data, error: null, loading: false })
          failures = 0
        }
      } catch (cause) {
        if (!controller.signal.aborted) {
          failures = Math.min(failures + 1, 5)
          setResult((previous) => ({
            ...previous,
            error:
              cause instanceof Error ? cause.message : 'Could not load data',
            loading: false,
          }))
        }
      } finally {
        pending = false
        if (!controller.signal.aborted && settings.refreshSeconds)
          timer = window.setTimeout(
            () => {
              if (!document.hidden) void load()
            },
            Math.max(15, settings.refreshSeconds) * 1000 * 2 ** failures,
          )
      }
    }
    const visible = () => {
      if (!document.hidden) {
        window.clearTimeout(timer)
        void load()
      }
    }
    void load()
    document.addEventListener('visibilitychange', visible)
    return () => {
      controller.abort()
      window.clearTimeout(timer)
      document.removeEventListener('visibilitychange', visible)
    }
  }, [settings, path, validate, demo, revision])
  return { ...result, retry: () => retry((n) => n + 1) }
}
