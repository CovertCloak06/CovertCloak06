/**
 * JSON fetch with timeouts, bounded retries on 429/5xx (honouring
 * Retry-After), and errors that never echo credentials.
 */
export class UpstreamError extends Error {
  override name = 'UpstreamError';
  constructor(
    message: string,
    readonly status: number | null,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  /** Label used in error messages instead of the URL (which may carry an api_key). */
  label: string;
}

export async function fetchJson<T>(url: string, opts: FetchJsonOptions): Promise<T> {
  const { headers = {}, timeoutMs = 10_000, retries = 3, signal, fetchImpl = fetch, label } = opts;
  let attempt = 0;
  for (;;) {
    attempt++;
    let res: Response;
    try {
      const timeout = AbortSignal.timeout(timeoutMs);
      res = await fetchImpl(url, {
        headers: { accept: 'application/json', ...headers },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (err) {
      if (signal?.aborted) throw err;
      if (attempt > retries) {
        throw new UpstreamError(`${label}: network error (${(err as Error).name})`, null, true);
      }
      await backoff(attempt, null);
      continue;
    }

    if (res.ok) return (await res.json()) as T;

    const retryable = res.status === 429 || res.status >= 500;
    if (!retryable || attempt > retries) {
      // Drain the body so the connection can be reused; don't include it in errors.
      await res.body?.cancel().catch(() => undefined);
      throw new UpstreamError(`${label}: HTTP ${res.status}`, res.status, retryable);
    }
    await res.body?.cancel().catch(() => undefined);
    await backoff(attempt, res.headers.get('retry-after'));
  }
}

async function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  let ms = Math.min(250 * 2 ** (attempt - 1), 8_000) * (0.75 + Math.random() * 0.5);
  if (retryAfter) {
    const secs = Number(retryAfter);
    if (Number.isFinite(secs)) ms = Math.min(Math.max(ms, secs * 1000), 30_000);
  }
  await new Promise((r) => setTimeout(r, ms));
}

/** Runs `fn` over `items` with at most `limit` in flight. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return results;
}
