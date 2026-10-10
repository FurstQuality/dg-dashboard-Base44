import { spawn } from "node:child_process";
import { mkdir, writeFile, rename } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sourceFingerprint } from "./release-snapshot.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const before = await sourceFingerprint(root);
const steps = [
  ["Unit and database security tests", ["node_modules/vitest/vitest.mjs", "run"]],
  [
    "Sandbox isolation tests",
    ["--test", "scripts/sandbox-env.test.mjs", "scripts/release-snapshot.test.mjs", "scripts/base44-workspace.test.mjs"],
  ],
  ["TypeScript", ["node_modules/typescript/bin/tsc", "--noEmit", "--pretty", "false"]],
  ["Production build", ["node_modules/vite/bin/vite.js", "build"]],
  ["Base44 full-stack build", ["node_modules/vite/bin/vite.js", "build", "--config", "vite.base44.config.ts"]],
];
const checks = [];
for (const [name, args] of steps) {
  console.log(`Checking: ${name}`);
  const code = await new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: "inherit" });
    child.once("error", () => resolve(1));
    child.once("exit", (value) => resolve(value ?? 1));
  });
  checks.push({ name, passed: code === 0 });
  if (code !== 0) break;
}
const after = await sourceFingerprint(root);
checks.push({ name: "Source unchanged during checks", passed: before.hash === after.hash });
const report = {
  version: 1,
  sourceHash: before.hash,
  fileCount: before.fileCount,
  checkedAt: new Date().toISOString(),
  passed: checks.every((check) => check.passed),
  checks,
  published: false,
};
await mkdir(new URL("../.sandbox/", import.meta.url), { recursive: true });
const temporary = new URL("../.sandbox/release-check.tmp", import.meta.url);
await writeFile(temporary, JSON.stringify(report, null, 2), { mode: 0o600 });
await rename(temporary, new URL("../.sandbox/release-check.json", import.meta.url));
console.log(
  report.passed
    ? "Source checks passed. No code or data was published."
    : "Release blocked. Review the failed checks.",
);
process.exitCode = report.passed ? 0 : 1;
