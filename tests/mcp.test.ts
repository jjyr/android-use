import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
it("real MCP client discovers agreed tool and preserves top-level-await REPL state", async () => {
  const root = await mkdtemp(join(tmpdir(), "android-use-mcp-"));
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify({
      stateDir: root,
      devices: [
        {
          id: "test",
          expected: { serial: "not-a-real-device" },
          wireless: "not-connected",
        },
      ],
    }),
  );
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/src/cli.js"), "mcp", "--config", path],
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => {});
  const client = new Client({ name: "test-client", version: "1" });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    expect(list.tools.map((t) => t.name)).toEqual(["android_repl"]);
    const initial = await client.callTool({
      name: "android_repl",
      arguments: {},
    });
    const id = JSON.parse((initial.content as any)[0].text).session_id;
    expect(id).toBeTypeOf("string");
    const first = await client.callTool({
      name: "android_repl",
      arguments: {
        session_id: id,
        code: "let answer = await Promise.resolve(41); answer",
      },
    });
    expect(first.isError).toBeFalsy();
    expect((first.content as any).some((c: any) => c.text === "41")).toBe(true);
    const second = await client.callTool({
      name: "android_repl",
      arguments: { session_id: id, code: "answer += 1; answer" },
    });
    expect((second.content as any).some((c: any) => c.text === "42")).toBe(
      true,
    );
    const reset = await client.callTool({
      name: "android_repl",
      arguments: { session_id: id, reset: true },
    });
    expect(reset.isError).toBeFalsy();
    const expired = await client.callTool({
      name: "android_repl",
      arguments: { session_id: id, code: "answer" },
    });
    expect(expired.isError).toBe(true);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
}, 15000);
