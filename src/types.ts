import { z } from "zod";
export const deviceSchema = z
  .object({
    id: z.string().regex(/^[\w-]{1,64}$/),
    expected: z.object({
      serial: z.string().min(1),
      model: z.string().optional(),
    }),
    usb: z.string().optional(),
    wireless: z.string().optional(),
  })
  .strict();
export const configSchema = z
  .object({
    adbPath: z.string().default("adb"),
    mode: z.enum(["mixed", "text"]).default("mixed"),
    stateDir: z.string().optional(),
    devices: z.array(deviceSchema).min(1),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (new Set(c.devices.map((d) => d.id)).size !== c.devices.length)
      ctx.addIssue({ code: "custom", message: "Duplicate enrollment IDs" });
  });
export type Config = z.infer<typeof configSchema>;
export type Enrollment = z.infer<typeof deviceSchema>;
export type ConnectionKind = "usb" | "wireless";
export type Rect = [number, number, number, number];
export interface Element {
  id: string;
  text: string;
  description: string;
  resourceId: string;
  className: string;
  bounds: Rect;
  clickable: boolean;
  longClickable: boolean;
  editable: boolean;
  focused: boolean;
  enabled: boolean;
  password: boolean;
  scrollable: boolean;
}
export interface Probe {
  packageName: string | null;
  activity: string | null;
  rotation: number | null;
  awake: boolean | null;
  locked: boolean | null;
  size: [number, number] | null;
}
export interface Observation {
  schemaVersion: 1;
  id: string;
  sessionId: string;
  deviceId: string;
  connection: ConnectionKind;
  generation: string;
  captureStartedAt: string;
  captureEndedAt: string;
  components: {
    pixels?: string;
    hierarchy?: string;
    foreground: string;
  };
  foreground: {
    packageName: string | null;
    activity: string | null;
  };
  display: {
    width: number;
    height: number;
    rotation: number | null;
    scale: 1;
  };
  elements: Element[];
  capabilities: {
    pixels: boolean;
    hierarchy: boolean;
    textInput: boolean;
  };
  limitations: string[];
  partial: boolean;
  screenshot?: Buffer;
}
export interface ActionResult {
  requestId: string;
  dispatch: "not_dispatched" | "completed" | "unknown";
  effect: "changed" | "no_change" | "unverified";
  elapsedMs: number;
  settling: "stable" | "timeout";
  observation: Observation | null;
  error?: {
    code: string;
    message: string;
  };
}
export type Target =
  | {
      elementId: string;
    }
  | {
      x: number;
      y: number;
    };
export interface Mutation {
  observationId: string;
  requestId: string;
}
export type Sink = (observation: Observation) => void;
export class AndroidError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "AndroidError";
  }
}
export const packageSchema = z
  .string()
  .regex(/^[A-Za-z][\w]*(?:\.[A-Za-z][\w]*)+$/);
export const mutationSchema = z.object({
  observationId: z.string().uuid(),
  requestId: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});
export function publicObservation(o: Observation) {
  const { screenshot, ...rest } = o;
  return rest;
}
