import { spawn } from "node:child_process";
import { AndroidError } from "./types.js";
export interface ProcessResult {
  stdout: Buffer;
  stderr: string;
  code: number;
}
export type Runner = (
  file: string,
  args: string[],
  options?: {
    timeoutMs?: number;
    maxBytes?: number;
  },
) => Promise<ProcessResult>;
export const run: Runner = (file, args, options = {}) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    const output: Buffer[] = [];
    const errors: Buffer[] = [];
    let bytes = 0;
    let done = false;
    const fail = (error: Error) => {
      if (done) return;
      done = true;
      child.kill("SIGKILL");
      clearTimeout(timer);
      reject(error);
    };
    const timer = setTimeout(
      () =>
        fail(
          new AndroidError(
            "COMMAND_TIMEOUT",
            "ADB command exceeded its deadline; dispatched commands may have executed",
          ),
        ),
      options.timeoutMs ?? 15000,
    );
    child.on("error", (e) => fail(e));
    child.stdout.on("data", (b: Buffer) => {
      bytes += b.length;
      if (bytes > (options.maxBytes ?? 6 * 1024 * 1024))
        fail(new AndroidError("OUTPUT_LIMIT", "Command output exceeded limit"));
      else output.push(b);
    });
    child.stderr.on("data", (b: Buffer) => {
      bytes += b.length;
      if (bytes > (options.maxBytes ?? 6 * 1024 * 1024))
        fail(new AndroidError("OUTPUT_LIMIT", "Command output exceeded limit"));
      else errors.push(b);
    });
    child.on("close", (code) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve({
        stdout: Buffer.concat(output),
        stderr: Buffer.concat(errors).toString("utf8"),
        code: code ?? -1,
      });
    });
  });
export function shellQuote(s: string) {
  return "'" + s.replaceAll("'", "'\\''") + "'";
}
export function shellArgs(args: string[]) {
  return args.map(shellQuote).join(" ");
}
