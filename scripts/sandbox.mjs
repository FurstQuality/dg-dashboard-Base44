import { readFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { sandboxEnvironment } from './sandbox-env.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const source = await readFile(resolve(root, '.env'), 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
  const draft = await readFile(resolve(root, '.env.sandbox.local'), 'utf8').catch(error => { if (error.code === 'ENOENT') throw new Error('Copy .env.sandbox.example to .env.sandbox.local and configure a separate Supabase project.'); throw error; });
  const env = sandboxEnvironment(source, draft);
  await mkdir(resolve(root, '.sandbox/environment'), { recursive: true });
  console.log('DG Dashboard sandbox: http://127.0.0.1:5190 — isolated settings, hot reload, no deployment.');
  const child = spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js'), 'dev', '--mode', 'sandbox', '--host', '127.0.0.1', '--port', '5190', '--strictPort'], { cwd: root, env, stdio: 'inherit' });
  child.on('error', () => { console.error('Could not start the sandbox process.'); process.exitCode = 1; });
  child.on('exit', code => { process.exitCode = code ?? 1; });
  process.on('SIGTERM', () => child.kill('SIGTERM'));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
