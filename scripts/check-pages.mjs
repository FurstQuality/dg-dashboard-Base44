import { readFile } from "node:fs/promises";

const base = new URL(process.argv[2] ?? "http://127.0.0.1:5180");
if (!["127.0.0.1", "localhost", "[::1]"].includes(base.hostname)) {
  throw new Error("Page checks must target a local preview.");
}
const registry = JSON.parse(await readFile(new URL("../docs/feature-registry.json", import.meta.url), "utf8"));
const pages = registry.filter((page) => page.file.endsWith(".tsx") && !page.route.includes("$") && page.status !== "API");
const results = [];
let next = 0;

async function worker() {
  while (next < pages.length) {
    const page = pages[next++];
    const started = Date.now();
    try {
      const response = await fetch(new URL(page.route, base), { signal: AbortSignal.timeout(30_000) });
      const body = await response.text();
      const html = response.headers.get("content-type")?.includes("text/html") ?? false;
      const serverError = /h3 swallowed SSR error|"unhandled":true|Internal Server Error/.test(body);
      results.push({ route: page.route, status: response.status, html, ok: response.ok && html && !serverError,
        authRequired: page.auth_required, ms: Date.now() - started });
    } catch (error) {
      results.push({ route: page.route, ok: false, error: error.message, authRequired: page.auth_required });
    }
  }
}

await Promise.all(Array.from({ length: 4 }, worker));
results.sort((a, b) => a.route.localeCompare(b.route));
const failed = results.filter((row) => !row.ok);
console.log(JSON.stringify({ scope: "Static page HTTP/SSR loading only; no login, browser hydration, or writes",
  total: results.length, passed: results.length - failed.length, failed: failed.length, results }, null, 2));
process.exitCode = failed.length ? 1 : 0;
