import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchHosts } from './api'
import type { ConnectionSettings, Host } from './types'

export function useInventory(settings: ConnectionSettings) {
  const [hosts, setHosts] = useState<Host[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const refreshController = useRef<AbortController | null>(null)
  const requestPending = useRef(false)

  const load = useCallback(
    async (manual = false, automatic = false) => {
      if (automatic && requestPending.current) return true
      requestPending.current = true
      refreshController.current?.abort()
      const controller = new AbortController()
      refreshController.current = controller
      if (manual) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      try {
        const nextHosts = await fetchHosts(settings, controller.signal)
        if (controller.signal.aborted) return
        setHosts(nextHosts)
        setError(null)
        setLastUpdated(new Date())
        return true
      } catch (cause) {
        if ((cause as Error).name !== 'AbortError') {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Could not reach the monitor',
          )
          return false
        }
      } finally {
        if (refreshController.current === controller)
          requestPending.current = false
        if (!controller.signal.aborted) {
          setLoading(false)
          setRefreshing(false)
        }
      }
    },
    [settings],
  )

  useEffect(() => {
    let cancelled = false
    let timer: number | undefined
    let failures = 0
    const poll = async (initial = false) => {
      if (cancelled) return
      if (document.hidden && !initial) return
      const succeeded = await load(!initial, !initial)
      failures = succeeded ? 0 : Math.min(failures + 1, 4)
      if (!cancelled && settings.refreshSeconds)
        timer = window.setTimeout(
          () => void poll(),
          settings.refreshSeconds * 1000 * 2 ** failures,
        )
    }
    const visible = () => {
      if (!document.hidden) {
        window.clearTimeout(timer)
        void poll()
      }
    }
    void poll(true)
    document.addEventListener('visibilitychange', visible)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
      refreshController.current?.abort()
      document.removeEventListener('visibilitychange', visible)
    }
  }, [load, settings.refreshSeconds])

  return { hosts, loading, refreshing, error, lastUpdated, load }
}
