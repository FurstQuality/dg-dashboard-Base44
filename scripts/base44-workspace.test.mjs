import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, relative, isAbsolute } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { sandboxProgram, quoteShell } from "./base44-workspace-remote.mjs";
import {
  classify,
  sharedPath,
  selectedChanges,
  planChanges,
  applyLocal,
  digest,
  assertNoCredential,
  checkedPath,
  inventory,
} from "./base44-workspace-lib.mjs";

async function removeFixture(root) {
  const target = resolve(root),
    rel = relative(resolve(tmpdir()), target);
  assert.ok(rel.startsWith("dgd-base44-") && !rel.includes("..") && !isAbsolute(rel));
  await rm(target, { recursive: true, force: true });
}

test("classifies independent changes, concurrent edits and deletions", () => {
  assert.equal(classify("a", "a", "b"), "base44_changed");
  assert.equal(classify("a", "b", "a"), "local_changed");
  assert.equal(classify("a", "b", "c"), "conflict");
  assert.equal(classify("a", "b", "b"), "in_sync");
  assert.equal(classify("a", null, "a"), "local_changed");
  assert.equal(classify(null, "b", "c"), "conflict");
});

test("excludes credentials, private directories, traversal and platform-managed files", () => {
  for (const path of [
    ".env",
    "src/../.env",
    "src/.env",
    "src\\a.ts",
    "C:/src/a.ts",
    "src/x.key",
    ".agents/settings.json",
    "public/uploads/course.png",
    "package.json",
    "base44/.app.jsonc",
    "vite.config.ts",
    "public/node_modules/key.json",
  ])
    assert.equal(sharedPath(path), false, path);
  for (const path of [
    "src/a.ts",
    "docs/guide.md",
    "public/logo.png",
    "supabase/migrations/change.sql",
    "drizzle/migrations/change.sql",
    "drizzle/migrations/meta/_journal.json",
    "vite.base44.config.ts",
  ])
    assert.equal(sharedPath(path), true, path);
});

test("selective transfers reject conflicts, the wrong direction and deletion", () => {
  const plan = planChanges(
    { "src/a.ts": "a", "src/b.ts": "a", "src/c.ts": "a" },
    { "src/a.ts": "b", "src/b.ts": "a" },
    { "src/a.ts": "c", "src/b.ts": "b", "src/c.ts": "a" },
  );
  assert.throws(() => selectedChanges(plan, ["src/a.ts"], "push"), /Both editors/);
  assert.throws(() => selectedChanges(plan, ["src/b.ts"], "push"), /overwrite/);
  assert.throws(() => selectedChanges(plan, ["src/c.ts"], "push"), /Deletion/);
  assert.equal(selectedChanges(plan, ["src/b.ts"], "pull")[0].state, "base44_changed");
  assert.throws(() => selectedChanges(plan, [], "push"), /Name the files/);
});

test("private credential values are refused but public keys are allowed", () => {
  for (const value of [
    "ghp_" + "a".repeat(40),
    "sb_secret_" + "b".repeat(35),
    ["postgresql:", "//owner:password@db.invalid/db"].join(""),
    ["-----BEGIN", "PRIVATE KEY-----"].join(" "),
  ])
    assert.throws(() => assertNoCredential(Buffer.from(value), "src/a.ts"), /credential/);
  const jwt = [
    Buffer.from('{"alg":"HS256"}').toString("base64url"),
    Buffer.from('{"role":"service_role"}').toString("base64url"),
    "signature",
  ].join(".");
  assert.throws(() => assertNoCredential(Buffer.from(jwt), "src/a.ts"), /Privileged/);
  assert.doesNotThrow(() => assertNoCredential(Buffer.from("sb_publishable_example"), "src/a.ts"));
});

test("pull backs up originals and refuses a stale local file without overwriting it", async () => {
  const root = await mkdtemp(join(tmpdir(), "dgd-base44-test-"));
  try {
    await mkdir(join(root, "src"));
    await writeFile(join(root, "src/a.ts"), "original");
    const bytes = Buffer.from("remote change");
    await applyLocal(
      root,
      [{ path: "src/a.ts", expected: digest("original"), bytes, sha256: digest(bytes) }],
      join(root, "backup"),
    );
    assert.equal(await readFile(join(root, "src/a.ts"), "utf8"), "remote change");
    assert.equal(await readFile(join(root, "backup/src/a.ts"), "utf8"), "original");
    await assert.rejects(
      () =>
        applyLocal(
          root,
          [
            {
              path: "src/a.ts",
              expected: digest("original"),
              bytes: Buffer.from("overwrite"),
              sha256: digest("overwrite"),
            },
          ],
          join(root, "backup2"),
        ),
      /changed during/,
    );
    assert.equal(await readFile(join(root, "src/a.ts"), "utf8"), "remote change");
  } finally {
    await removeFixture(root);
  }
});

test("symlinked source directories cannot redirect a transfer", async () => {
  const root = await mkdtemp(join(tmpdir(), "dgd-base44-link-"));
  try {
    await mkdir(join(root, "target"));
    await symlink(join(root, "target"), join(root, "src"), "junction");
    await assert.rejects(() => checkedPath(root, "src/a.ts"), /symbolic link/);
  } finally {
    await removeFixture(root);
  }
});

test("inventory detects shared source while excluding private and platform files", async () => {
  const root = await mkdtemp(join(tmpdir(), "dgd-base44-inventory-"));
  try {
    await mkdir(join(root, "src/private"), { recursive: true });
    await writeFile(join(root, "src/a.ts"), "code");
    await writeFile(join(root, "src/.env"), "private");
    await writeFile(join(root, "src/private/key.pem"), "private");
    await writeFile(join(root, "package.json"), "platform-specific");
    assert.deepEqual(await inventory(root), { "src/a.ts": digest("code") });
  } finally {
    await removeFixture(root);
  }
});

test("remote transfer checks hashes, preserves originals, and refuses a concurrent edit", async () => {
  const root = await mkdtemp(join(tmpdir(), "dgd-base44-remote-"));
  const run = async (request) =>
    JSON.parse(
      (
        await promisify(execFile)(
          process.execPath,
          ["--input-type=module", "-e", sandboxProgram(request, root)],
          { cwd: root, windowsHide: true },
        )
      ).stdout,
    );
  try {
    await mkdir(join(root, "src"));
    await mkdir(join(root, ".dgd-sync.local"));
    await writeFile(join(root, "src/a.ts"), "original");
    assert.equal((await run({ operation: "inventory" })).files["src/a.ts"], digest("original"));
    const id = "b".repeat(32),
      bytes = Buffer.from("local change");
    const payload = JSON.stringify([
      {
        path: "src/a.ts",
        expected: digest("original"),
        sha256: digest(bytes),
        content: bytes.toString("base64"),
      },
    ]);
    await writeFile(join(root, ".dgd-sync.local", id + ".json"), payload);
    await run({ operation: "apply", id, payloadHash: digest(payload) });
    assert.equal(await readFile(join(root, "src/a.ts"), "utf8"), "local change");
    assert.equal(
      await readFile(join(root, ".dgd-sync.local", "backup-" + id, "src/a.ts"), "utf8"),
      "original",
    );
    const id2 = "c".repeat(32);
    await writeFile(join(root, ".dgd-sync.local", id2 + ".json"), payload);
    await assert.rejects(
      () => run({ operation: "apply", id: id2, payloadHash: digest(payload) }),
      /Local file changed/,
    );
    assert.equal(await readFile(join(root, "src/a.ts"), "utf8"), "local change");
    const remote = await run({ operation: "read", paths: ["src/a.ts"] });
    assert.equal(Buffer.from(remote.files[0].content, "base64").toString(), "local change");
  } finally {
    await removeFixture(root);
  }
});

test("a wrong application root and shell metacharacters cannot redirect a command", async () => {
  await assert.rejects(
    () =>
      promisify(execFile)(process.execPath, [
        "--input-type=module",
        "-e",
        sandboxProgram({ operation: "inventory" }),
      ]),
    /Unexpected sandbox directory/,
  );
  assert.equal(quoteShell("a'$(secret);`command`"), "'a'\\''$(secret);`command`'");
});
