import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { defaultStateDir, reconcileLease } from "./storage.js";
import type { Config } from "./types.js";
const runtime = `android_repl executes authorized host Node code; it is not a sandbox. Persistent bindings: android, console, emit.
Start: let phone = await android.open({deviceId:'configured-id',connection:'wireless'}); phone.observation holds its latest observation.
Read: await android.listDevices(); await phone.observe(); await phone.listApps();
Every mutation needs {observationId:phone.observation.id,requestId:'unique-id'}.
Actions: launchApp/stopApp({...,packageName}), openUrl({...,packageName,url}), click/longPress({...,target:{elementId}} or {x,y}), swipe/drag({...,start:{x,y},end:{x,y},durationMs}), pressKey({...,key:'Back'|'Home'|'Recents'}), typeText({...,text,mode:'insert'|'append'|'replace'|'clear'}).
Images and structured observations are emitted automatically after open/observe/resume/actions. Inspect each returned state before choosing another action. Coordinates refer to full, unscaled PNG pixels. No image means no screenshot-point input. Partial observations cannot admit mutations. UI hierarchy can miss visible browser controls; use inspected screenshot points in mixed mode.
Text requires the operator-provisioned dedicated IME. Insert uses current selection; append moves to the end; replace/clear require complete extracted text. Never assume a command acknowledged the user task. Errors preserve prior observations; input may have executed before capture failed. Request IDs never repeat, even after reconnect.
await phone.pause() for manual takeover; await phone.resume() for fresh state; await phone.close() to release. Disconnect invalidates the handle: close/reopen explicitly. No automatic input replay. Keep invocations small: wall deadline 30 seconds; idle expiry 10 minutes. Reset kills this session and closes handles. Runtime/tool contract is docs/mcp-contract.md.`;
interface Session {
  id: string;
  child: ChildProcess;
  busy: boolean;
  last: number;
}
export class ReplSessions {
  sessions = new Map<string, Session>();
  timer: NodeJS.Timeout;
  constructor(public config: Config) {
    this.timer = setInterval(() => {
      for (const s of this.sessions.values())
        if (!s.busy && Date.now() - s.last > 600000) void this.destroy(s);
    }, 30000);
    this.timer.unref();
  }
  async create() {
    const worker = fileURLToPath(new URL("./repl-worker.js", import.meta.url));
    const child = fork(worker, [], {
      detached: true,
      serialization: "advanced",
      stdio: ["ignore", "ignore", "pipe", "ipc"],
    });
    child.stderr?.on("data", () => {});
    const s = { id: randomUUID(), child, busy: false, last: Date.now() };
    this.sessions.set(s.id, s);
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error("Worker startup timeout")),
          10000,
        );
        child.once("message", () => {
          clearTimeout(timer);
          resolve();
        });
        child.once("error", (e) => {
          clearTimeout(timer);
          reject(e);
        });
        child.once("exit", () => {
          clearTimeout(timer);
          reject(new Error("Worker exited"));
        });
        child.send({ type: "init", config: this.config });
      });
      return s;
    } catch (e) {
      await this.destroy(s);
      throw e;
    }
  }
  async destroy(s: Session) {
    this.sessions.delete(s.id);
    const pid = s.child.pid;
    if (pid && s.child.exitCode === null) {
      const exited = new Promise<void>((resolve) =>
        s.child.once("exit", () => resolve()),
      );
      try {
        process.kill(-pid, "SIGKILL");
      } catch {}
      await Promise.race([exited, new Promise((r) => setTimeout(r, 1000))]);
    }
    const root = this.config.stateDir ?? defaultStateDir();
    for (const d of this.config.devices) {
      try {
        const { hash } = await import("./storage.js");
        const owner = JSON.parse(
          await readFile(
            join(root, hash(d.expected.serial) + ".lease", "owner.json"),
            "utf8",
          ),
        );
        if (owner.pid === pid) await reconcileLease(root, d.expected.serial);
      } catch {}
    }
  }
  async call(args: { code?: string; session_id?: string; reset?: boolean }) {
    if (!args.session_id) {
      if (args.code !== undefined || args.reset)
        throw new Error(
          "Create a session without code before executing or resetting",
        );
      const s = await this.create();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ session_id: s.id, documentation: runtime }),
          },
        ],
      };
    }
    const s = this.sessions.get(args.session_id);
    if (!s) throw new Error("Session expired or unknown");
    if (s.busy) throw new Error("BUSY: invocation already running");
    if (args.reset) {
      await this.destroy(s);
      return {
        content: [
          {
            type: "text" as const,
            text: "Session reset; owned leases released",
          },
        ],
      };
    }
    if (!args.code)
      return { content: [{ type: "text" as const, text: runtime }] };
    s.busy = true;
    s.last = Date.now();
    try {
      return await new Promise<any>((resolve, reject) => {
        const finish = () => {
          clearTimeout(timer);
          s.child.off("message", message);
          s.child.off("exit", exited);
        };
        const message = (reply: any) => {
          if (!reply.done) return;
          finish();
          resolve({
            isError: !!reply.error,
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  session_id: s.id,
                  ...(reply.error ? { error: reply.error } : {}),
                }),
              },
              ...reply.content,
            ],
          });
        };
        const exited = () => {
          finish();
          reject(
            new Error(
              "Worker exited; dispatched actions may have unknown outcome",
            ),
          );
        };
        const timer = setTimeout(() => {
          finish();
          void this.destroy(s).then(() =>
            resolve({
              isError: true,
              content: [
                {
                  type: "text",
                  text: JSON.stringify({
                    error: {
                      code: "REPL_TIMEOUT",
                      message:
                        "Worker and owned processes terminated; dispatched mutations may have executed. Session invalidated; do not replay input.",
                    },
                  }),
                },
              ],
            }),
          );
        }, 30000);
        s.child.on("message", message);
        s.child.once("exit", exited);
        s.child.send({ type: "eval", code: args.code });
      });
    } finally {
      s.busy = false;
      s.last = Date.now();
    }
  }
  async close() {
    clearInterval(this.timer);
    await Promise.all([...this.sessions.values()].map((s) => this.destroy(s)));
  }
}
export async function startMcp(config: Config) {
  const sessions = new ReplSessions(config);
  const server = new McpServer({ name: "android-use", version: "0.1.0" });
  server.registerTool(
    "android_repl",
    {
      description:
        "Persistent Android computer-use REPL; host-code execution; automatically returns fresh structured observations and PNG images",
      inputSchema: {
        code: z.string().max(16384).optional(),
        session_id: z.string().uuid().optional(),
        reset: z.boolean().optional(),
      },
    },
    async (args) => {
      try {
        return await sessions.call(args);
      } catch (e) {
        return {
          isError: true,
          content: [
            {
              type: "text",
              text: JSON.stringify({
                error: { message: e instanceof Error ? e.message : String(e) },
              }),
            },
          ],
        };
      }
    },
  );
  await server.connect(new StdioServerTransport());
  process.once(
    "SIGTERM",
    () => void sessions.close().then(() => process.exit(0)),
  );
  process.once(
    "SIGINT",
    () => void sessions.close().then(() => process.exit(0)),
  );
  process.stdin.once("end", () => void sessions.close());
}
