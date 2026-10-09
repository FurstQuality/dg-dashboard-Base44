/**
 * Polite PDGA fetcher: one request at a time per host, a minimum gap with
 * jitter, exponential backoff, and Retry-After support. Never bypasses PDGA
 * protections — 403/429 pause and retry, then give up and report.
 */
export type FetchLog = {
  url: string;
  status: number | null;
  attempts: number;
  ms: number;
  error: string | null;
  retrieved_at: string;
};

export type PoliteFetcher = {
  get: (
    url: string,
  ) => Promise<{ ok: boolean; status: number | null; text: string; log: FetchLog }>;
  logs: FetchLog[];
};

export function createPoliteFetcher(
  opts: {
    minGapMs?: number;
    jitterMs?: number;
    maxAttempts?: number;
    baseBackoffMs?: number;
    fetchImpl?: typeof fetch;
    sleep?: (ms: number) => Promise<void>;
  } = {},
): PoliteFetcher {
  const minGap = opts.minGapMs ?? 1500;
  const jitter = opts.jitterMs ?? 500;
  const maxAttempts = opts.maxAttempts ?? 4;
  const base = opts.baseBackoffMs ?? 2000;
  const f = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const lastAt = new Map<string, number>();
  let chain: Promise<unknown> = Promise.resolve();
  const logs: FetchLog[] = [];

  async function run(url: string) {
    const host = new URL(url).host;
    const t0 = Date.now();
    let status: number | null = null;
    let error: string | null = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const wait = (lastAt.get(host) ?? 0) + minGap + Math.random() * jitter - Date.now();
      if (wait > 0) await sleep(wait);
      lastAt.set(host, Date.now());
      try {
        const res = await f(url, {
          headers: {
            "User-Agent": "DGDashboard/1.0 (+https://dgdashboard.app)",
            Accept: "text/html",
          },
        });
        status = res.status;
        if (res.ok) {
          const text = await res.text();
          const log = {
            url,
            status,
            attempts: attempt,
            ms: Date.now() - t0,
            error: null,
            retrieved_at: new Date().toISOString(),
          };
          logs.push(log);
          return { ok: true, status, text, log };
        }
        if (res.status === 404) {
          error = "not found";
          break;
        }
        const ra = Number(res.headers.get("retry-after"));
        error = `http ${res.status}`;
        await sleep(
          Number.isFinite(ra) && ra > 0
            ? Math.min(ra, 120) * 1000
            : base * 2 ** (attempt - 1) + Math.random() * jitter,
        );
      } catch (e) {
        error = e instanceof Error ? e.message.slice(0, 200) : "network error";
        await sleep(base * 2 ** (attempt - 1));
      }
    }
    const log = {
      url,
      status,
      attempts: maxAttempts,
      ms: Date.now() - t0,
      error,
      retrieved_at: new Date().toISOString(),
    };
    logs.push(log);
    return { ok: false, status, text: "", log };
  }

  return {
    logs,
    get(url) {
      const p = chain.then(() => run(url));
      chain = p.catch(() => undefined);
      return p;
    },
  };
}
