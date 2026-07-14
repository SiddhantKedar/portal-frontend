interface Options {
    /** Poll interval in ms. Fires only while the tab is visible. */
    intervalMs: number;
    /** Set false to pause polling entirely. Default true. */
    enabled?: boolean;
    /** Fire an immediate fetch on mount. Default false — most pages already fetch via their own effects. */
    runOnMount?: boolean;
    /** Min gap between fetches — coalesces bursts (visibility+focus firing back-to-back).
     *  Manual refetch() bypasses this. Default 2000. */
    minRefetchGapMs?: number;
    /** Optional heavier fetcher used for wake events (visibility return, focus, pageshow, online)
     *  AND manual refetch() calls. If omitted, `fetcher` is used everywhere. Use this to keep
     *  the periodic tick lightweight while still getting a full refresh when the user returns. */
    onWake?: () => Promise<void>;
}
interface Result {
    /** Fire a full refetch now, bypassing the throttle. Wire this to your Refresh button. */
    refetch: () => Promise<void>;
    /** True while a fetch is in flight. */
    isRefetching: boolean;
    /** When the last fetch completed. Null before the first fetch finishes. */
    lastFetchedAt: Date | null;
}
export declare function useAutoRefresh(fetcher: () => Promise<void>, options: Options): Result;
export {};
