#!/usr/bin/env node
/**
 * Route reachability audit.
 *
 * Reports:
 *  1. link targets that match no route in the generated route tree (dead links)
 *  2. routes nothing in the app links to (orphans)
 *  3. links that land on a redirect-only forwarder instead of the real page
 *
 * Usage: bun scripts/check-route-reachability.mjs
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const SRC = "src";

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.(tsx?|ts)$/.test(entry) && !entry.endsWith(".gen.ts")) out.push(p);
  }
  return out;
}

const files = walk(SRC);

// --- routes ---------------------------------------------------------------
const routes = new Map(); // path -> { file, forwarder, redirectTo }
for (const file of files) {
  if (!file.startsWith(join(SRC, "routes"))) continue;
  const s = readFileSync(file, "utf8");
  const m = /createFileRoute\("([^"]+)"\)/.exec(s);
  if (!m) continue;
  let path = m[1].replace("/_authenticated", "").replace(/\/$/, "") || "/";
  const redirect = /redirect\(\{\s*to:\s*"([^"]+)"/.exec(s);
  routes.set(path, {
    file,
    forwarder: Boolean(redirect) && !/\bcomponent\s*:/.test(s),
    redirectTo: redirect?.[1] ?? null,
  });
}

// --- link targets ---------------------------------------------------------
const links = new Map(); // path -> Set(file)
for (const file of files) {
  const s = readFileSync(file, "utf8");
  for (const re of [/to="(\/[^"]*)"/g, /\bto:\s*"(\/[^"]*)"/g, /\bdefaultTo:\s*"(\/[^"]*)"/g]) {
    for (const m of s.matchAll(re)) {
      const path = m[1].replace(/\/$/, "") || "/";
      if (!links.has(path)) links.set(path, new Set());
      links.get(path).add(file);
    }
  }
}

const dead = [];
const forwarded = [];
for (const [path, where] of links) {
  const r = routes.get(path);
  if (!r) {
    dead.push([path, [...where]]);
    continue;
  }
  if (r.forwarder) forwarded.push([path, r.redirectTo, [...where]]);
}

const orphans = [];
for (const [path, r] of routes) {
  if (r.forwarder || path.includes("$") || path.startsWith("/api") || path.startsWith("/.")) continue;
  if (!links.has(path)) orphans.push(path);
}

const section = (title, rows) => {
  console.log(`\n${title} (${rows.length})`);
  for (const row of rows) console.log("  " + row);
};

section(
  "Dead links (no such route)",
  dead.map(([p, w]) => `${p}  <- ${w.join(", ")}`),
);
section(
  "Links landing on a forwarder",
  forwarded.map(([p, to, w]) => `${p} -> ${to}  <- ${w.join(", ")}`),
);
section("Routes nothing links to", orphans.sort());

console.log(
  `\n${routes.size} routes, ${[...routes.values()].filter((r) => r.forwarder).length} forwarders, ${links.size} distinct link targets`,
);
if (dead.length || forwarded.length) process.exitCode = 1;
