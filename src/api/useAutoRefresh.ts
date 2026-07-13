import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** Poll interval in ms. Fetches only fire while the page is visible. */
  intervalMs: number
  /** Set false to pause polling (e.g. while a blocking modal is open). Default true. */
  enabled?: boolean
  /** Fire an immediate fetch on mount (or when re-enabled). Default true. */
  runOnMount?: boolean
  /** Min gap between fetches — coalesces bursts when visibility+focus+online all fire together.
   *  Manual refetch() bypasses this. Default 2000. */
  minRefetchGapMs?: number
}

interface Result {
  /** Fire a fetch right now, bypassing the throttle. Use for the Refresh button. */
  refetch: () => Promise<void>
  /** True while a fetch is in flight. Use to spin the refresh icon / disable the button. */
  isRefetching: boolean
  /** When the last fetch completed. Null before the first fetch finishes. */
  lastFetchedAt: Date | null
}

export function useAutoRefresh(
  fetcher: () => Promise<void>,
  options: Options,
): Result {
  const {
    intervalMs,
    enabled = true,
    runOnMount = true,
    minRefetchGapMs = 2000,
  } = options

  // Latest-ref pattern: the effect below doesn't re-subscribe when `fetcher`
  // changes on every render. It always reads the current one from this ref.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher

  const inFlightRef = useRef(false)
  const lastFetchTimeRef = useRef(0)
  const [isRefetching, setIsRefetching] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const doFetch = useCallback(async (opts?: { force?: boolean }) => {
    if (inFlightRef.current) return // never overlap requests
    if (!opts?.force && Date.now() - lastFetchTimeRef.current < minRefetchGapMs) return

    inFlightRef.current = true
    setIsRefetching(true)
    try {
      await fetcherRef.current()
      lastFetchTimeRef.current = Date.now()
      setLastFetchedAt(new Date())
    } catch (err) {
      // Caller's fetcher owns its error state — we just log so it isn't swallowed.
      console.error('[useAutoRefresh] fetch failed:', err)
    } finally {
      inFlightRef.current = false
      setIsRefetching(false)
    }
  }, [minRefetchGapMs])

  useEffect(() => {
    if (!enabled) return

    let intervalId: number | undefined
    const startInterval = () => {
      if (intervalId != null) return
      intervalId = window.setInterval(() => { doFetch() }, intervalMs)
    }
    const stopInterval = () => {
      if (intervalId != null) { window.clearInterval(intervalId); intervalId = undefined }
    }

    // "User is looking at the page again" → refetch now + resume interval.
    const wake = () => {
      if (document.hidden) return
      doFetch()
      startInterval()
    }

    const onVisibility = () => { document.hidden ? stopInterval() : wake() }

    // Mobile Safari bfcache restore fires pageshow (persisted=true), not visibilitychange.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) wake() }

    // Desktop: two windows both visible, focus swaps between them. visibility doesn't fire; focus does.
    const onFocus = () => { if (!document.hidden) wake() }

    // Mobile: cellular ↔ wifi handover, or signal restored after a dead zone.
    const onOnline = () => { if (!document.hidden) wake() }

    if (!document.hidden) {
      if (runOnMount) doFetch()
      startInterval()
    }

    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('pageshow', onPageShow)
    window.addEventListener('focus', onFocus)
    window.addEventListener('online', onOnline)

    return () => {
      stopInterval()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('pageshow', onPageShow)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('online', onOnline)
    }
  }, [enabled, intervalMs, runOnMount, doFetch])

  const refetch = useCallback(() => doFetch({ force: true }), [doFetch])
  return { refetch, isRefetching, lastFetchedAt }
}