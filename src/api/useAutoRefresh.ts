import { useCallback, useEffect, useRef, useState } from 'react'

interface Options {
  /** Poll interval in ms. Fires only while the tab is visible. */
  intervalMs: number
  /** Set false to pause polling entirely. Default true. */
  enabled?: boolean
  /** Fire an immediate fetch on mount. Default false — most pages already fetch via their own effects. */
  runOnMount?: boolean
  /** Min gap between fetches — coalesces bursts (visibility+focus firing back-to-back).
   *  Manual refetch() bypasses this. Default 2000. */
  minRefetchGapMs?: number
  /** Optional heavier fetcher used for wake events (visibility return, focus, pageshow, online)
   *  AND manual refetch() calls. If omitted, `fetcher` is used everywhere. Use this to keep
   *  the periodic tick lightweight while still getting a full refresh when the user returns. */
  onWake?: () => Promise<void>
}

interface Result {
  /** Fire a full refetch now, bypassing the throttle. Wire this to your Refresh button. */
  refetch: () => Promise<void>
  /** True while a fetch is in flight. */
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
    runOnMount = false,
    minRefetchGapMs = 2000,
    onWake,
  } = options

  // Latest-ref pattern: the main effect below doesn't tear down and rebuild
  // listeners when the caller passes a new closure each render.
  const fetcherRef = useRef(fetcher)
  fetcherRef.current = fetcher
  const onWakeRef = useRef(onWake)
  onWakeRef.current = onWake

  const inFlightRef = useRef(false)
  const lastFetchTimeRef = useRef(0)
  const [isRefetching, setIsRefetching] = useState(false)
  const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null)

  const doFetch = useCallback(async (opts?: { useWakeFetcher?: boolean; force?: boolean }) => {
    if (inFlightRef.current) return
    if (!opts?.force && Date.now() - lastFetchTimeRef.current < minRefetchGapMs) return

    const fn = opts?.useWakeFetcher && onWakeRef.current
      ? onWakeRef.current
      : fetcherRef.current

    inFlightRef.current = true
    setIsRefetching(true)
    try {
      await fn()
      lastFetchTimeRef.current = Date.now()
      setLastFetchedAt(new Date())
    } catch (err) {
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

    // "User is looking at the page again" → heavy refetch now + resume interval.
    const wake = () => {
      if (document.hidden) return
      doFetch({ useWakeFetcher: true })
      startInterval()
    }

    const onVisibility = () => { document.hidden ? stopInterval() : wake() }
    // Mobile Safari bfcache restore fires pageshow (persisted=true), not visibilitychange.
    const onPageShow = (e: PageTransitionEvent) => { if (e.persisted) wake() }
    // Two windows both visible, focus swaps between them. visibility doesn't fire; focus does.
    const onFocus = () => { if (!document.hidden) wake() }
    // Mobile: cellular ↔ wifi handover, or signal restored after a dead zone.
    const onOnline = () => { if (!document.hidden) wake() }

    if (!document.hidden) {
      if (runOnMount) doFetch({ useWakeFetcher: true })
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

  const refetch = useCallback(() => doFetch({ useWakeFetcher: true, force: true }), [doFetch])
  return { refetch, isRefetching, lastFetchedAt }
}