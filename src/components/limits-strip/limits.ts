/** Shapes of `limits://state` and the small pure helpers the strip draws with. */
import type { BotAvatarType } from "bot-avatars";
import { paceOf } from "./pace";

export type Edge = "top" | "right" | "bottom" | "left";
export type Activity = "idle" | "working" | "waiting" | "done";
export type Tone = "calm" | "amber" | "red";

export type LimitWindow = {
  id: string;
  label: string;
  used: number | null;
  used_abs: number | null;
  limit_abs: number | null;
  unit: string | null;
  resets_at: number | null;
  /** Length of the window, when the provider says: what the pace needs. */
  span_ms: number | null;
  group: string | null;
};
export type LocalModel = {
  name: string;
  size_bytes: number | null;
  vram_bytes: number | null;
  context: number | null;
  quant: string | null;
  params: string | null;
  expires_at: number | null;
};
export type Reading = {
  windows: LimitWindow[];
  plan: string | null;
  account: string | null;
  note: string | null;
  local_models: LocalModel[];
};
export type Ring = {
  id: string;
  label: string;
  local: boolean;
  beta: boolean;
  account: { label: string | null; email: string | null } | null;
  status: "pending" | "ok" | "absent" | "needs_auth" | "rate_limited" | "error";
  message: string | null;
  reading: Reading | null;
  read_at: number | null;
  activity: Activity;
};
/** How the strip draws itself (`StripPrefs::look` in Rust); the window is already sized for it. */
export type Look = {
  size: "s" | "m" | "l";
  scale: number;
  show_percent: boolean;
  show_pace: boolean;
  contrast: boolean;
};
export type Snapshot = { open: boolean; edge: Edge; look: Look; rings: Ring[] };

export const DEFAULT_LOOK: Look = { size: "m", scale: 1, show_percent: true, show_pace: true, contrast: false };

export function tone(used: number | null): Tone {
  if (used == null || used < 0.8) return "calm";
  return used < 0.95 ? "amber" : "red";
}

/** The window that decides the ring: the fullest one. */
export function worst(ring: Ring): number | null {
  const used = (ring.reading?.windows ?? []).map((w) => w.used).filter((u): u is number => u != null);
  return used.length ? Math.max(...used) : null;
}

/**
 * The two arcs: the first window the provider lists (its short one, the
 * session or "5h limit") outside, the fullest of the rest inside. A ring
 * with one window draws a single arc.
 */
export function arcs(ring: Ring): { outer: number | null; inner: number | null } {
  const ws = (ring.reading?.windows ?? []).filter((w) => w.used != null);
  if (!ws.length) return { outer: null, inner: null };
  if (ws.length === 1) return { outer: ws[0].used, inner: null };
  const rest = ws.slice(1).map((w) => w.used as number);
  return { outer: ws[0].used, inner: Math.max(...rest) };
}

/**
 * The "on pace" tick of a ring: of the windows its arcs draw, the fullest
 * one that has a pace, placed on the arc that draws it.
 */
export function paceTick(ring: Ring, now: number): { at: number; arc: "outer" | "inner" } | null {
  const ws = (ring.reading?.windows ?? []).filter((w) => w.used != null);
  if (!ws.length) return null;
  const rest = ws.slice(1);
  const inner = rest.length ? rest.reduce((a, b) => ((b.used as number) > (a.used as number) ? b : a)) : null;
  let best: { at: number; arc: "outer" | "inner"; used: number } | null = null;
  for (const [w, arc] of [
    [ws[0], "outer"],
    [inner, "inner"],
  ] as const) {
    const p = w ? paceOf(w, now) : null;
    if (w && p && (!best || (w.used as number) > best.used)) best = { at: p.expected, arc, used: w.used as number };
  }
  return best && { at: best.at, arc: best.arc };
}

/** "claude:work" → "claude": rings of one tool share the part before the colon. */
export function toolOf(id: string): string {
  return id.split(":")[0];
}

/** Consecutive rings of the same tool, so several accounts read as one stack. */
export function groups(rings: Ring[]): { tool: string; rings: Ring[] }[] {
  const out: { tool: string; rings: Ring[] }[] = [];
  for (const r of rings) {
    const tool = toolOf(r.id);
    const last = out[out.length - 1];
    if (last && last.tool === tool) last.rings.push(r);
    else out.push({ tool, rings: [r] });
  }
  return out;
}

/**
 * A bot body per account, from the free body types. Each tool starts on its
 * own shape and a second or third account of that tool takes the next one,
 * so two Claude logins never look alike.
 */
const BODIES: Record<string, BotAvatarType[]> = {
  claude: ["star", "flower", "ghost", "circle", "hexagon"],
  codex: ["clover", "mech", "square", "circle", "ghost"],
};
const FALLBACK: BotAvatarType[] = ["circle", "ghost", "mech", "flower", "square"];

export function bodyOf(ring: Ring, rings: Ring[]): BotAvatarType {
  const tool = toolOf(ring.id);
  const list = BODIES[tool] ?? FALLBACK;
  const index = rings.filter((r) => toolOf(r.id) === tool).findIndex((r) => r.id === ring.id);
  return list[Math.max(0, index) % list.length];
}
