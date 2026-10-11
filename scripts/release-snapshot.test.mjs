import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { sourceFingerprint } from "./release-snapshot.mjs";

test("release fingerprint changes with source, never includes credentials or local data", async () => {
  const root = await mkdtemp(join(tmpdir(), "dgd-release-test-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/app.ts"), "version one");
    const first = await sourceFingerprint(root);
    await writeFile(join(root, ".env"), "private fixture");
    await mkdir(join(root, ".admin-connections.local"));
    await writeFile(join(root, ".admin-connections.local/key"), "private fixture");
    assert.deepEqual(await sourceFingerprint(root), first);
    await writeFile(join(root, "src/app.ts"), "version two");
    assert.notEqual((await sourceFingerprint(root)).hash, first.hash);
    const sourceOnly = await sourceFingerprint(root);
    await mkdir(join(root, "deployment/base44"), { recursive: true });
    await writeFile(join(root, "deployment/base44/public-config.json"), '{"url":"https://fixture.invalid"}');
    assert.notEqual((await sourceFingerprint(root)).hash, sourceOnly.hash);
    const withDeployment = await sourceFingerprint(root);
    await writeFile(join(root, "vite.base44.config.ts"), "export default {};");
    assert.notEqual((await sourceFingerprint(root)).hash, withDeployment.hash);
    const beforeMigration = await sourceFingerprint(root);
    await mkdir(join(root, "drizzle/migrations"), { recursive: true });
    await writeFile(join(root, "drizzle/migrations/example.sql"), "select 1;");
    assert.notEqual((await sourceFingerprint(root)).hash, beforeMigration.hash);
  } finally {
    if (
      !resolve(root).startsWith(resolve(tmpdir()) + "\\") &&
      !resolve(root).startsWith(resolve(tmpdir()) + "/")
    )
      throw new Error("Unsafe test directory");
    await rm(root, { recursive: true, force: true });
  }
});
