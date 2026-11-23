"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import {
  fetchBacktest,
  fetchBurndown,
  fetchLiveMetrics,
  fetchQueue,
  fetchWeekly,
  shouldRetry,
  WAKE_RETRY_DELAY_MS,
} from "@/lib/api";

/** Loads every tab's data once, so switching tabs does not wait on the server. */
export function DataWarmup() {
  const client = useQueryClient();
  useEffect(() => {
    const retry = { retry: shouldRetry, retryDelay: WAKE_RETRY_DELAY_MS };
    void (async () => {
      await Promise.all([
        client.prefetchQuery({ queryKey: ["burndown"], queryFn: ({ signal }) => fetchBurndown(signal), ...retry }),
        client.prefetchQuery({
          queryKey: ["tickets", { status: "open" }],
          queryFn: ({ signal }) => fetchQueue({ status: "open" }, signal),
          ...retry,
        }),
        client.prefetchQuery({ queryKey: ["metrics", "live"], queryFn: ({ signal }) => fetchLiveMetrics(signal), ...retry }),
        client.prefetchQuery({ queryKey: ["metrics", "weekly"], queryFn: ({ signal }) => fetchWeekly(signal), ...retry }),
        client.prefetchQuery({ queryKey: ["metrics", "backtest"], queryFn: ({ signal }) => fetchBacktest(signal), ...retry }),
      ]);
      await client.prefetchQuery({
        queryKey: ["tickets", { status: "all" }],
        queryFn: ({ signal }) => fetchQueue({ status: "all" }, signal),
        ...retry,
      });
    })();
  }, [client]);
  return null;
}
