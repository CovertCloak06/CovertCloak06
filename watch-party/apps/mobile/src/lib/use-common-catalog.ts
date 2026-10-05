/**
 * Loads the room's common catalog. Loading state is derived from a request
 * key (room + search + who is in the room) rather than toggled inside
 * effects, so a membership change or new search simply makes the old result
 * stale and the next response replaces it.
 */
import type { CommonTitle } from '@watch-party/shared/client';
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';

const PAGE_SIZE = 20;

interface Loaded {
  key: string;
  titles: CommonTitle[];
  total: number;
  page: number;
  partial: boolean;
}

export function useCommonCatalog(opts: {
  token: string | null;
  roomId: string | null;
  enabled: boolean;
  query: string;
  membershipKey: string;
}) {
  const { token, roomId, enabled, query, membershipKey } = opts;
  const key = `${roomId ?? ''}|${query}|${membershipKey}`;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failure, setFailure] = useState<{ key: string; message: string } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || !token || !roomId) return;
    let cancelled = false;
    api
      .roomCatalog(token, roomId, { page: 1, pageSize: PAGE_SIZE, ...(query ? { query } : {}) })
      .then((res) => {
        if (!cancelled)
          setLoaded({
            key,
            titles: res.results,
            total: res.totalResults,
            page: 1,
            partial: res.partial,
          });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setFailure({
            key,
            message: err instanceof Error ? err.message : 'Could not load titles',
          });
      });
    return () => {
      cancelled = true;
    };
    // `key` already encodes room, query and membership.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, token, attempt]);

  const current = loaded?.key === key ? loaded : null;
  const error = failure?.key === key && !current ? failure.message : null;

  const loadMore = useCallback(async () => {
    if (!current || !token || !roomId || loadingMore || current.titles.length >= current.total)
      return;
    setLoadingMore(true);
    try {
      const res = await api.roomCatalog(token, roomId, {
        page: current.page + 1,
        pageSize: PAGE_SIZE,
        ...(query ? { query } : {}),
      });
      setLoaded((prev) =>
        prev && prev.key === current.key
          ? {
              ...prev,
              titles: [...prev.titles, ...res.results],
              page: current.page + 1,
              total: res.totalResults,
            }
          : prev,
      );
    } catch (err) {
      setFailure({
        key: current.key,
        message: err instanceof Error ? err.message : 'Could not load more titles',
      });
    } finally {
      setLoadingMore(false);
    }
  }, [current, token, roomId, loadingMore, query]);

  const retry = useCallback(() => {
    setFailure(null);
    setAttempt((n) => n + 1);
  }, []);

  return {
    titles: current?.titles ?? [],
    total: current?.total ?? 0,
    partial: current?.partial ?? false,
    loading: (enabled && !current && !error) || loadingMore,
    error,
    loadMore,
    retry,
  };
}
