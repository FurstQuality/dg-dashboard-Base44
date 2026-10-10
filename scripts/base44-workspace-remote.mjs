import {
  roots,
  rootFiles,
  digest,
  sharedPath,
  checkedPath,
  readSource,
  inventory,
  assertNoCredential,
  applyLocal,
} from "./base44-workspace-lib.mjs";

// All code sent to the sandbox comes from this checkout, never from a remote file.
export function sandboxProgram(request, expectedRoot = "/app") {
  return `
import { createHash } from 'node:crypto';
import { lstat, readFile, readdir, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { dirname, resolve, relative, isAbsolute } from 'node:path';
const roots = ${JSON.stringify(roots)};
const rootFiles = new Set(${JSON.stringify([...rootFiles])});
const digest = ${digest.toString()};
${[sharedPath, checkedPath, readSource, inventory, assertNoCredential, applyLocal].map((fn) => fn.toString()).join("\n")}
if (process.cwd() !== ${JSON.stringify(expectedRoot)}) throw Error('Unexpected sandbox directory');
const request = ${JSON.stringify(request)};
if (request.operation === 'inventory') {
  console.log(JSON.stringify({ files: await inventory(process.cwd()) }));
} else if (request.operation === 'read') {
  const files = [];
  let total = 0;
  for (const path of request.paths) {
    const bytes = await readSource(process.cwd(), path);
    if (!bytes) throw Error('Source file disappeared: ' + path);
    assertNoCredential(bytes, path);
    total += bytes.length;
    if (total > 600000) throw Error('Read fewer files per transfer (600 KB limit)');
    files.push({ path, sha256: digest(bytes), content: bytes.toString('base64') });
  }
  console.log(JSON.stringify({ files }));
} else if (request.operation === 'apply') {
  if (!/^[a-f0-9]{32}$/.test(request.id)) throw Error('Invalid transfer ID');
  const staging = resolve('.dgd-sync.local');
  const stat = await lstat(staging);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw Error('Unsafe staging directory');
  const payload = resolve(staging, request.id + '.json');
  if ((await lstat(payload)).isSymbolicLink()) throw Error('Unsafe transfer file');
  const serialized = await readFile(payload);
  if (digest(serialized) !== request.payloadHash) throw Error('Transfer payload changed');
  const rows = JSON.parse(serialized).map(row => ({ ...row, bytes: Buffer.from(row.content, 'base64') }));
  const backups = resolve(staging, 'backup-' + request.id);
  await mkdir(backups); // exclusive backup directory, never reuse another transfer's originals
  await applyLocal(process.cwd(), rows, backups);
  await unlink(payload);
  console.log(JSON.stringify({ files: rows.map(row => ({path: row.path, sha256: row.sha256})), backup: '.dgd-sync.local/backup-' + request.id }));
} else throw Error('Unsupported sandbox operation');
`;
}

// A single POSIX-quoted argument; file names and source cannot become shell commands.
export const quoteShell = (value) => "'" + value.replaceAll("'", "'\\''") + "'";
