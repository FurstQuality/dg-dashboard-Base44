import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, writeFile, mkdir, rename, open, unlink } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import {
  digest,
  sharedPath,
  inventory,
  readSource,
  planChanges,
  selectedChanges,
  assertNoCredential,
  applyLocal,
} from "./base44-workspace-lib.mjs";
import { sandboxProgram, quoteShell } from "./base44-workspace-remote.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const config = JSON.parse(
  await readFile(resolve(root, "deployment/base44/workspace.json"), "utf8"),
);
const args = process.argv.slice(2),
  operation = args.shift() || "status";
const branchIndex = args.indexOf("--branch"),
  branch = branchIndex < 0 ? "main" : args[branchIndex + 1];
if (branchIndex >= 0) args.splice(branchIndex, 2);
const jsonIndex = args.indexOf("--json"),
  json = jsonIndex >= 0;
if (json) args.splice(jsonIndex, 1);
if (
  !/^[a-f0-9]{24}$/.test(config.appId) ||
  !branch ||
  branch.startsWith("-") ||
  branch.length > 200 ||
  /[\x00-\x1f]/.test(branch)
)
  throw Error("Invalid app or branch configuration");
const home = resolve(root, ".base44-workspace.local");
const statePath = resolve(home, `${config.appId}-${digest(branch).slice(0, 16)}.json`);
const cli = resolve(root, "node_modules/base44/bin/run.js");
const report = { appId: config.appId, branch, operation, published: false };

async function call(args, input) {
  return new Promise((yes, no) => {
    const child = spawn(
      process.execPath,
      [cli, ...args, "--app-id", config.appId, "--branch", branch, "--json"],
      {
        cwd: root,
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      no(Error("Base44 timed out. Recheck status before retrying a transfer."));
    }, 180000);
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 4000000) {
        child.kill();
        clearTimeout(timer);
        no(Error("Base44 output exceeded the safe limit."));
      }
    });
    // Never relay arbitrary remote command output or authorization data to the console.
    child.stderr.resume();
    child.stdin.on("error", () => {});
    child.on("error", (error) => {
      clearTimeout(timer);
      no(Error(`Cannot start Base44 CLI (${error.code}). Run npm ci.`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      let value;
      try {
        value = JSON.parse(output);
      } catch {
        return no(Error("Base44 returned an invalid response. Check npx base44 whoami."));
      }
      if (code || value.error || value.exitCode) {
        const busy = /BUILDER_BUSY|external agent|already working/i.test(output);
        const pending = /COMMIT_FLUSH_PENDING/.test(output);
        return no(
          Error(
            busy
              ? "Base44 is busy. Finish the builder task and retry; do not bypass its lock."
              : pending
                ? "Base44 is still saving its commit. Wait briefly, then recheck status and checkpoint."
                : "Base44 rejected this operation. Check CLI authentication, branch access and preview logs; no automatic retry was made.",
          ),
        );
      }
      yes(value);
    });
    child.stdin.end(input);
  });
}

async function run(request) {
  const result = await call([
    "sandbox",
    "run",
    `node --input-type=module -e ${quoteShell(sandboxProgram(request))}`,
    "--cwd",
    ".",
    "--timeout-ms",
    "120000",
  ]);
  try {
    return JSON.parse(result.stdout);
  } catch {
    throw Error("Invalid or truncated sandbox result. Recheck status before retrying.");
  }
}

async function saveState(state) {
  const temporary = statePath + ".tmp";
  await writeFile(temporary, JSON.stringify(state, null, 2), { mode: 0o600 });
  await rename(temporary, statePath);
}

let lock;
try {
  if (!["status", "pull", "push"].includes(operation))
    throw Error(
      "Use status, pull or push. Transfers require explicit file paths; push also requires --branch.",
    );
  if (operation === "push" && branchIndex < 0)
    throw Error("Choose the exact destination with --branch. Publishing is a separate action.");
  if (args.some((path) => !sharedPath(path)))
    throw Error(
      "Only explicit shared source paths are allowed. Credentials and hosting adapters cannot be transferred.",
    );
  await mkdir(home, { recursive: true });
  lock = await open(resolve(home, "session.lock"), "wx");
  await lock.writeFile(
    JSON.stringify({ pid: process.pid, branch, startedAt: new Date().toISOString() }),
  );
  let state;
  try {
    state = JSON.parse(await readFile(statePath, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    const seed = JSON.parse(
      await readFile(resolve(root, "deployment/base44/source-baseline.json"), "utf8"),
    );
    if (seed.appId !== config.appId) throw Error("Baseline belongs to another Base44 app");
    state = { appId: config.appId, branch, files: seed.files };
  }
  if (
    state.appId !== config.appId ||
    state.branch !== branch ||
    Object.entries(state.files).some(
      ([path, hash]) => !sharedPath(path) || !/^[a-f0-9]{64}$/.test(hash),
    )
  )
    throw Error(
      "Invalid source baseline. Preserve it for inspection; do not reset it to conceal conflicts.",
    );
  // Remote calls are deliberately sequential: Base44 permits one external agent per app.
  const remote = (await run({ operation: "inventory" })).files;
  const local = await inventory(root);
  const plan = planChanges(state.files, local, remote);
  for (const row of plan.filter((row) => row.state === "in_sync")) {
    if (row.local) state.files[row.path] = row.local;
    else delete state.files[row.path];
  }
  const changed = plan.filter((row) => row.state !== "in_sync");
  report.counts = Object.fromEntries(
    ["in_sync", "local_changed", "base44_changed", "conflict"].map((key) => [
      key,
      plan.filter((row) => row.state === key).length,
    ]),
  );
  report.changes = changed.map(({ path, state }) => ({ path, state }));
  if (operation !== "status") {
    const rows = selectedChanges(plan, args, operation).filter((row) => row.state !== "in_sync");
    const id = randomUUID().replaceAll("-", "");
    if (rows.length && operation === "pull") {
      const result = await run({ operation: "read", paths: rows.map((row) => row.path) });
      const downloads = rows.map((row) => {
        const file = result.files.find((file) => file.path === row.path);
        if (!file || file.sha256 !== row.remote)
          throw Error(`Base44 changed during transfer: ${row.path}`);
        return {
          path: row.path,
          expected: row.local,
          sha256: row.remote,
          bytes: Buffer.from(file.content, "base64"),
        };
      });
      const backup = resolve(home, "backups", id);
      await applyLocal(root, downloads, backup);
      report.backup = backup;
    }
    if (rows.length && operation === "push") {
      const uploads = [];
      let size = 0;
      for (const row of rows) {
        const bytes = await readSource(root, row.path);
        if (!bytes || digest(bytes) !== row.local)
          throw Error(`Local file changed during transfer: ${row.path}`);
        assertNoCredential(bytes, row.path);
        size += bytes.length;
        if (size > 600000) throw Error("Transfer fewer files at a time (600 KB limit)");
        uploads.push({
          path: row.path,
          expected: row.remote,
          sha256: row.local,
          content: bytes.toString("base64"),
        });
      }
      report.beforeCheckpoint = await call([
        "sandbox",
        "checkpoint",
        "--name",
        `Before Codex transfer (${rows.length} files)`,
      ]);
      const payload = JSON.stringify(uploads);
      await call(["sandbox", "write", `.dgd-sync.local/${id}.json`], payload);
      const applied = await run({ operation: "apply", id, payloadHash: digest(payload) });
      report.backup = applied.backup;
      report.afterCheckpoint = await call([
        "sandbox",
        "checkpoint",
        "--name",
        `Codex source transfer (${rows.length} files); not published`,
      ]);
    }
    const afterRemote = (await run({ operation: "inventory" })).files;
    const afterLocal = await inventory(root);
    for (const row of rows) {
      const expected = operation === "push" ? row.local : row.remote;
      if (afterRemote[row.path] !== expected || afterLocal[row.path] !== expected)
        throw Error(
          `File changed before final verification: ${row.path}. Originals were preserved; recheck status.`,
        );
      state.files[row.path] = expected;
    }
    report.transferred = rows.map((row) => row.path);
    const remaining = planChanges(state.files, afterLocal, afterRemote);
    report.counts = Object.fromEntries(
      ["in_sync", "local_changed", "base44_changed", "conflict"].map((key) => [
        key,
        remaining.filter((row) => row.state === key).length,
      ]),
    );
    report.changes = remaining
      .filter((row) => row.state !== "in_sync")
      .map(({ path, state }) => ({ path, state }));
  }
  state.checkedAt = new Date().toISOString();
  await saveState(state);
  await writeFile(resolve(home, "latest-report.json"), JSON.stringify(report, null, 2), {
    mode: 0o600,
  });
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(
      `DG Dashboard / Base44 ${branch}: ${report.counts.local_changed} local changes, ${report.counts.base44_changed} Base44 changes, ${report.counts.conflict} conflicts.`,
    );
    for (const row of report.changes) console.log(`${row.state.padEnd(15)} ${row.path}`);
    if (report.transferred)
      console.log(
        `Verified ${report.transferred.length} transferred files. Originals and report: .base44-workspace.local/`,
      );
    console.log("Nothing published. Run status again after either editor makes changes.");
  }
  if (operation === "status" && report.counts.conflict) process.exitCode = 2;
} catch (error) {
  if (lock) {
    report.failed = true;
    report.error = error.message;
    await writeFile(resolve(home, "latest-report.json"), JSON.stringify(report, null, 2), {
      mode: 0o600,
    }).catch(() => {});
  }
  console.error(
    error.code === "EEXIST" && !lock
      ? "Another workspace transfer is running. Do not remove its lock while it is active."
      : error.message,
  );
  if (operation !== "status")
    console.error(
      "A failed batch can contain completed files. Originals are preserved; run status before retrying.",
    );
  process.exitCode = 1;
} finally {
  if (lock) {
    await lock.close();
    await unlink(resolve(home, "session.lock"));
  }
}
