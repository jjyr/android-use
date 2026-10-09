import {
  mkdir,
  readFile,
  writeFile,
  rm,
  stat,
  readdir,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { AndroidError } from "./types.js";
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function defaultStateDir() {
  return join(tmpdir(), `android-use-${process.getuid?.() ?? "user"}`);
}
export class Lease {
  token = randomUUID();
  private released = false;
  constructor(public path: string) {}
  static async acquire(root: string, identity: string) {
    await mkdir(root, { recursive: true, mode: 0o700 });
    const lease = new Lease(join(root, hash(identity) + ".lease"));
    try {
      await mkdir(lease.path, { mode: 0o700 });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        throw new AndroidError(
          "BUSY",
          "Device is leased; stale owners require explicit operator reconciliation",
        );
      throw e;
    }
    try {
      await writeFile(
        join(lease.path, "owner.json"),
        JSON.stringify({ pid: process.pid, token: lease.token }),
        { mode: 0o600 },
      );
      return lease;
    } catch (e) {
      await rm(lease.path, { recursive: true, force: true });
      throw e;
    }
  }
  async release() {
    if (this.released) return;
    const owner = JSON.parse(
      await readFile(join(this.path, "owner.json"), "utf8"),
    );
    if (owner.token === this.token) await rm(this.path, { recursive: true });
    this.released = true;
  }
}
export class Journal {
  constructor(
    public root: string,
    public identity: string,
  ) {}
  private path(id: string) {
    return join(
      this.root,
      hash(this.identity) + ".requests",
      hash(id) + ".json",
    );
  }
  async begin(id: string) {
    const path = this.path(id);
    await mkdir(join(this.root, hash(this.identity) + ".requests"), {
      recursive: true,
      mode: 0o700,
    });
    if (
      (await readdir(join(this.root, hash(this.identity) + ".requests")))
        .length >= 1000
    )
      throw new AndroidError(
        "RECOVERY_LIMIT",
        "Request history full; explicit operator retention maintenance required",
      );
    try {
      await writeFile(
        path,
        JSON.stringify({
          requestId: id,
          state: "unknown",
          at: new Date().toISOString(),
        }),
        { flag: "wx", mode: 0o600 },
      );
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "EEXIST")
        throw new AndroidError(
          "REQUEST_REPEATED",
          "Request ID was already dispatched or has unknown outcome; input will not be replayed",
        );
      throw e;
    }
  }
  async complete(id: string, dispatch: string) {
    await writeFile(
      this.path(id),
      JSON.stringify({
        requestId: id,
        state: dispatch,
        at: new Date().toISOString(),
      }),
      { mode: 0o600 },
    );
  }
}
export async function reconcileLease(root: string, identity: string) {
  const path = join(root, hash(identity) + ".lease");
  const owner = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
  try {
    process.kill(owner.pid, 0);
    throw new AndroidError("BUSY", "Owner process is still alive");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ESRCH") throw e;
  }
  const before = await stat(path);
  const current = JSON.parse(await readFile(join(path, "owner.json"), "utf8"));
  if (current.token !== owner.token || (await stat(path)).ino !== before.ino)
    throw new AndroidError("BUSY", "Lease changed during reconciliation");
  await rm(path, { recursive: true });
}
