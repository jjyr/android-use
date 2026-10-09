import { it, expect } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { mkdtemp, writeFile, rm, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PNG } from "pngjs";
it("MCP emits typed PNG and normalized state, rejects old references, and releases leases after worker timeout", async () => {
  const root = await mkdtemp(join(tmpdir(), "android-use-feedback-"));
  const p = new PNG({ width: 20, height: 40 });
  p.data.fill(255);
  const png = PNG.sync.write(p).toString("base64");
  const fake = join(root, "adb");
  await writeFile(
    fake,
    `#!${process.execPath}\nconst a=process.argv.slice(2).join(' ');let s='';if(a==='devices -l')s='List of devices attached\\nfixture device transport_id:1\\n';else if(a.includes('ro.serialno'))s='physical';else if(a.includes('ro.product.model'))s='fixture';else if(a.includes("'dumpsys' 'window'"))s='mCurrentFocus=Window{x u0 com.example.fixture/.Main} isKeyguardShowing=false';else if(a.includes("'dumpsys' 'input'"))s='SurfaceOrientation: 0';else if(a.includes("'dumpsys' 'power'"))s='mWakefulness=Awake';else if(a.includes("'wm' 'size'"))s='Physical size: 20x40';else if(a.includes('screencap')){process.stdout.write(Buffer.from('${png}','base64'));process.exit(0);}else if(a.includes('exec-out cat'))s='<hierarchy><node bounds="[1,1][10,20]" class="android.widget.Button" text="Click" clickable="true" enabled="true"/></hierarchy>';else if(a.includes('get-state'))s='device';process.stdout.write(s);`,
    { mode: 0o755 },
  );
  const path = join(root, "config.json");
  await writeFile(
    path,
    JSON.stringify({
      adbPath: fake,
      stateDir: root,
      devices: [
        { id: "test", expected: { serial: "physical" }, wireless: "fixture" },
      ],
    }),
  );
  const client = new Client({ name: "feedback-test", version: "1" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [resolve("dist/src/cli.js"), "mcp", "--config", path],
    stderr: "pipe",
  });
  transport.stderr?.on("data", () => {});
  try {
    await client.connect(transport);
    const first = await client.callTool({
      name: "android_repl",
      arguments: {},
    });
    const id = JSON.parse((first.content as any)[0].text).session_id;
    const open = await client.callTool({
      name: "android_repl",
      arguments: {
        session_id: id,
        code: "let phone = await android.open({deviceId:'test',connection:'wireless'}); let initial = phone.observation.id;",
      },
    });
    expect(open.isError).toBeFalsy();
    const image = (open.content as any).find((c: any) => c.type === "image");
    expect(image.mimeType).toBe("image/png");
    expect(image.data).toBe(png);
    const state = (open.content as any)
      .filter((c: any) => c.type === "text")
      .map((c: any) => JSON.parse(c.text))
      .find((c: any) => c.schemaVersion === 1);
    expect(state.elements[0].text).toBe("Click");
    expect(state.screenshot).toBeUndefined();
    const action = await client.callTool({
      name: "android_repl",
      arguments: {
        session_id: id,
        code: "await phone.click({observationId:initial,requestId:'click-once',target:{elementId:'1'}})",
      },
    });
    expect(action.isError).toBeFalsy();
    expect((action.content as any).some((c: any) => c.type === "image")).toBe(
      true,
    );
    const stale = await client.callTool({
      name: "android_repl",
      arguments: {
        session_id: id,
        code: "await phone.click({observationId:initial,requestId:'stale',target:{elementId:'1'}})",
      },
    });
    expect(stale.isError).toBe(true);
    expect(JSON.stringify(stale)).toContain("STALE_OBSERVATION");
    const recovered = await client.callTool({
      name: "android_repl",
      arguments: { session_id: id, code: "await phone.observe()" },
    });
    expect(recovered.isError).toBeFalsy();
    const timeout = await client.callTool(
      {
        name: "android_repl",
        arguments: { session_id: id, code: "while (true) {}" },
      },
      undefined,
      { timeout: 35000 },
    );
    expect(timeout.isError).toBe(true);
    expect(JSON.stringify(timeout)).toContain("REPL_TIMEOUT");
    expect(
      (await readdir(root)).filter((x) => x.endsWith(".lease")),
    ).toHaveLength(0);
  } finally {
    await client.close();
    await rm(root, { recursive: true, force: true });
  }
}, 40000);
