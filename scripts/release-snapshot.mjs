import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

/** Hash publishable source only. Environment files, vaults, backups and user data are excluded. */
export async function sourceFingerprint(root) {
  const files = [];
  async function walk(relative) {
    for (const entry of await readdir(join(root, relative), { withFileTypes: true }).catch(
      (error) => {
        if (error.code === "ENOENT") return [];
        throw error;
      },
    )) {
      if (entry.isSymbolicLink() || entry.name.startsWith(".") || entry.name === "node_modules")
        continue;
      const path = relative + "/" + entry.name;
      if (entry.isDirectory()) await walk(path);
      else if (entry.isFile()) files.push(path);
    }
  }
  for (const directory of ["src", "public", "scripts", "deployment", "supabase/migrations", ".github/workflows"])
    await walk(directory);
  for (const file of [
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "vite.base44.config.ts",
    "vitest.config.ts",
    "tsconfig.json",
    "eslint.config.js",
    "index.html",
  ]) {
    try {
      await readFile(join(root, file));
      files.push(file);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  const hash = createHash("sha256");
  for (const file of files.sort()) {
    const bytes = await readFile(join(root, file));
    hash.update(file + "\0" + bytes.length + "\0");
    hash.update(bytes);
  }
  return { hash: hash.digest("hex"), fileCount: files.length };
}
