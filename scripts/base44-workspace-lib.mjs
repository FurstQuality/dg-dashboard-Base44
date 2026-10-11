import { createHash } from "node:crypto";
import { lstat, readFile, mkdir, writeFile, rename, readdir, unlink } from "node:fs/promises";
import { dirname, resolve, relative, isAbsolute } from "node:path";

export const digest = (value) => createHash("sha256").update(value).digest("hex");
export const roots = [
  "src/",
  "public/",
  "scripts/",
  "docs/",
  "deployment/",
  "drizzle/migrations/",
  "supabase/migrations/",
  "supabase/functions/",
];
export const rootFiles = new Set([
  "AGENTS.md",
  "README.md",
  "tsconfig.json",
  "components.json",
  "eslint.config.js",
  "vitest.config.ts",
  "vite.base44.config.ts",
]);

/** Shared code only. Hosting adapters, secrets, databases and build output are separate. */
export function sharedPath(path) {
  if (typeof path !== "string" || path.length > 500 || /[\\:\x00-\x1f]/.test(path)) return false;
  const parts = path.split("/");
  if (parts.some((part) => !part || part.startsWith(".") || /^(node_modules|uploads)$/i.test(part)))
    return false;
  if (/\.(?:env|backup|dump|sql\.gz|pem|key|p12|pfx|crt)$/i.test(path)) return false;
  return rootFiles.has(path) || roots.some((root) => path.startsWith(root));
}

export function classify(base, local, remote) {
  if (local === remote) return "in_sync";
  if (local === base) return "base44_changed";
  if (remote === base) return "local_changed";
  return "conflict";
}

export function planChanges(base, local, remote) {
  return [...new Set([...Object.keys(base), ...Object.keys(local), ...Object.keys(remote)])]
    .filter(sharedPath)
    .sort()
    .map((path) => ({
      path,
      base: base[path] ?? null,
      local: local[path] ?? null,
      remote: remote[path] ?? null,
      state: classify(base[path] ?? null, local[path] ?? null, remote[path] ?? null),
    }));
}

export function selectedChanges(plan, paths, direction) {
  if (!paths.length)
    throw new Error("Name the files to transfer. Bulk overwrite is not supported.");
  const selected = [...new Set(paths)].map((path) => {
    if (!sharedPath(path)) throw new Error(`Not a shared source path: ${path}`);
    const row = plan.find((entry) => entry.path === path);
    if (!row) throw new Error(`No known source file: ${path}`);
    if (row.state === "conflict")
      throw new Error(`Both editors changed ${path}; review both versions first.`);
    const expected = direction === "push" ? "local_changed" : "base44_changed";
    if (row.state !== expected && row.state !== "in_sync")
      throw new Error(`A ${direction} would overwrite the other editor's change: ${path}`);
    if (!(direction === "push" ? row.local : row.remote))
      throw new Error(`Deletion requires a separate review: ${path}`);
    return row;
  });
  return selected;
}

/** Refuse links at every path segment, including links pointing inside the checkout. */
export async function checkedPath(root, path) {
  if (!sharedPath(path)) throw new Error(`Unsafe source path: ${path}`);
  const target = resolve(root, path),
    rel = relative(root, target);
  if (rel.startsWith("..") || isAbsolute(rel))
    throw new Error("Source path escaped its workspace.");
  let current = root;
  for (const part of path.split("/")) {
    current = resolve(current, part);
    const stat = await lstat(current).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Source path contains a symbolic link: ${path}`);
  }
  return target;
}

export async function readSource(root, path) {
  const target = await checkedPath(root, path);
  try {
    return await readFile(target);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

export async function inventory(root) {
  const files = {};
  async function walk(path) {
    const target = await checkedPath(root, path);
    const stat = await lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isDirectory()) {
      for (const entry of await readdir(target)) {
        const child = `${path}/${entry}`;
        if (sharedPath(child)) await walk(child);
      }
    } else if (stat?.isFile()) files[path] = digest(await readFile(target));
  }
  // The root directory itself is not a transferable file.
  for (const directory of roots) {
    const path = directory.slice(0, -1),
      target = resolve(root, path);
    await checkedPath(root, `${path}/__directory_check__`);
    const stat = await lstat(target).catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
    if (stat?.isSymbolicLink()) throw new Error(`Source path contains a symbolic link: ${path}`);
    if (stat?.isDirectory()) {
      for (const entry of await readdir(target)) {
        const child = `${path}/${entry}`;
        if (sharedPath(child)) await walk(child);
      }
    }
  }
  for (const path of rootFiles) {
    const bytes = await readSource(root, path);
    if (bytes !== null) files[path] = digest(bytes);
  }
  return files;
}

export function assertNoCredential(bytes, path) {
  if (!bytes || bytes.includes(0)) return;
  const text = bytes.toString("utf8");
  if (
    /(?:-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bgh[pousr]_[A-Za-z0-9]{30,}|\bgithub_pat_[A-Za-z0-9_]{40,}|\bsb_secret_[A-Za-z0-9_-]{15,}|\bsk_live_[A-Za-z0-9]{15,}|postgres(?:ql)?:\/\/[^\s:/]+:[^\s@]+@)/.test(
      text,
    )
  ) {
    throw new Error(`Possible private credential in ${path}; transfer refused.`);
  }
  for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
    try {
      if (JSON.parse(Buffer.from(match[0].split(".")[1], "base64url")).role === "service_role")
        throw new Error("privileged");
    } catch (error) {
      if (error.message === "privileged")
        throw new Error(`Privileged Supabase key in ${path}; transfer refused.`);
    }
  }
}

/** Preserve an original before replacing it, and check again immediately before rename. */
export async function applyLocal(root, rows, backupRoot) {
  for (const row of rows) {
    const current = await readSource(root, row.path);
    if ((current === null ? null : digest(current)) !== row.expected)
      throw new Error(`Local file changed during transfer: ${row.path}`);
    if (digest(row.bytes) !== row.sha256)
      throw new Error(`Transfer content hash mismatch: ${row.path}`);
    assertNoCredential(row.bytes, row.path);
  }
  for (const row of rows) {
    const target = await checkedPath(root, row.path),
      current = await readSource(root, row.path);
    if ((current === null ? null : digest(current)) !== row.expected)
      throw new Error(`Local file changed during transfer: ${row.path}`);
    if (current !== null) {
      const backup = resolve(backupRoot, row.path);
      if (relative(backupRoot, backup).startsWith("..")) throw new Error("Unsafe backup path");
      await mkdir(dirname(backup), { recursive: true });
      await writeFile(backup, current, { flag: "wx", mode: 0o600 });
    }
    await mkdir(dirname(target), { recursive: true });
    const temporary = target + `.codex-${process.pid}.tmp`;
    await writeFile(temporary, row.bytes, { flag: "wx" });
    try {
      const latest = await readSource(root, row.path);
      if ((latest === null ? null : digest(latest)) !== row.expected)
        throw new Error(`Local edit appeared before replacement: ${row.path}`);
      await rename(temporary, target);
    } finally {
      await unlink(temporary).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }
}
