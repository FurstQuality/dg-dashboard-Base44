// Server-only vault. No credential values are returned by the public server actions.
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from "node:crypto";
import { mkdir, open, readFile, rename, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve, sep } from "node:path";
import type { ConnectionCheck, ConnectionProvider, ConnectionSettings } from "./admin-connections";
import type { StudioConfiguration } from "./app-sandbox";

export type StoredConnection = {
  target: string;
  branch: string;
  token: string;
  revision: number;
  updatedAt: string;
  updatedBy: string;
  lastCheck: ConnectionCheck | null;
};
type Vault = { version: 1; connections: Partial<Record<ConnectionProvider, StoredConnection>>; studio?: StudioConfiguration };
type StorageOptions = { directory: string; key?: string; local: boolean };
const emptyVault = (): Vault => ({ version: 1, connections: {} });
const missing = (error: unknown) => (error as NodeJS.ErrnoException)?.code === "ENOENT";

export function connectionStorageOptions(): StorageOptions | null {
  if (process.env.DGD_HOSTED_RUNTIME === "base44") return null;
  const local = import.meta.env.DEV && process.env.NODE_ENV !== "production";
  const configuredDirectory = process.env.ADMIN_CONNECTIONS_DIRECTORY;
  const key = process.env.ADMIN_CONNECTIONS_ENCRYPTION_KEY;
  if (local && !configuredDirectory)
    return {
      directory: join(
        process.cwd(),
        process.env.DGD_SANDBOX === "1" ? ".sandbox" : "",
        ".admin-connections.local",
      ),
      key,
      local: true,
    };
  if (!configuredDirectory || !isAbsolute(configuredDirectory) || !key) return null;
  const directory = resolve(configuredDirectory);
  // Never put a production vault inside a static web root.
  for (const name of ["public", "dist", ".output/public"])
    if (directory === resolve(name) || directory.startsWith(resolve(name) + sep)) return null;
  return { directory, key, local: false };
}

export function connectionStorageStatus(): ConnectionSettings["storage"] {
  const options = connectionStorageOptions();
  return {
    available: !!options,
    mode: options?.local ? "local" : "hosted",
    message: options
      ? options.local
        ? "Saved on this development server. Tokens are encrypted and excluded from Git. Configure each hosted environment separately."
        : "Saved in this server's encrypted connection store."
      : "Saving requires a private persistent ADMIN_CONNECTIONS_DIRECTORY and a 32-byte base64 ADMIN_CONNECTIONS_ENCRYPTION_KEY on the host. Environment-configured connections can still be checked.",
  };
}

/** Atomic replacement + an exclusive writer lock preserve concurrent admin changes. */
export class ConnectionStore {
  constructor(private readonly options: StorageOptions) {}

  private async key(create: boolean): Promise<Buffer> {
    if (this.options.key) {
      const key = Buffer.from(this.options.key, "base64");
      if (key.length !== 32)
        throw new Error("Connection encryption key must be 32 bytes encoded as base64.");
      return key;
    }
    if (!this.options.local) throw new Error("Connection encryption key is not configured.");
    const path = join(this.options.directory, "key");
    try {
      return Buffer.from(await readFile(path, "utf8"), "base64");
    } catch (error) {
      if (!missing(error) || !create)
        throw new Error(
          "Connection encryption key is unavailable. Restore the original key to read saved connections.",
        );
      const key = randomBytes(32);
      await writeFile(path, key.toString("base64"), { flag: "wx", mode: 0o600 });
      return key;
    }
  }

  async read(): Promise<Vault> {
    let raw: string;
    try {
      raw = await readFile(join(this.options.directory, "connections.enc"), "utf8");
    } catch (error) {
      if (missing(error)) return emptyVault();
      throw new Error("The connection store cannot be read. Check server file permissions.");
    }
    try {
      const bytes = Buffer.from(raw, "base64");
      const decipher = createDecipheriv(
        "aes-256-gcm",
        await this.key(false),
        bytes.subarray(0, 12),
      );
      decipher.setAAD(Buffer.from("dgd-admin-connections-v1"));
      decipher.setAuthTag(bytes.subarray(12, 28));
      const vault = JSON.parse(
        Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString("utf8"),
      );
      if (vault.version !== 1 || !vault.connections) throw new Error("Invalid vault");
      return vault;
    } catch {
      throw new Error(
        "Saved connections could not be decrypted. Restore the original encryption key; existing settings have been preserved.",
      );
    }
  }

  async update(change: (vault: Vault) => void): Promise<Vault> {
    await mkdir(this.options.directory, { recursive: true, mode: 0o700 });
    const lockPath = join(this.options.directory, "write.lock");
    let lock;
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch {
      throw new Error(
        "Connection settings are busy or not writable. Try again after the current save.",
      );
    }
    const temp = join(this.options.directory, `connections-${randomUUID()}.tmp`);
    try {
      const vault = await this.read();
      change(vault);
      const iv = randomBytes(12);
      const writer = createCipheriv("aes-256-gcm", await this.key(true), iv);
      writer.setAAD(Buffer.from("dgd-admin-connections-v1"));
      const encrypted = Buffer.concat([
        writer.update(JSON.stringify(vault), "utf8"),
        writer.final(),
      ]);
      await writeFile(
        temp,
        Buffer.concat([iv, writer.getAuthTag(), encrypted]).toString("base64"),
        { flag: "wx", mode: 0o600 },
      );
      await rename(temp, join(this.options.directory, "connections.enc"));
      return vault;
    } finally {
      await unlink(temp).catch(() => undefined);
      await lock.close();
      await unlink(lockPath);
    }
  }
}

export function configuredConnectionStore(): ConnectionStore | null {
  const options = connectionStorageOptions();
  return options ? new ConnectionStore(options) : null;
}
