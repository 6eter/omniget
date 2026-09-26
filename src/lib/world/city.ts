// The city session: the route's half of `/world/v1` (omnidisc-server,
// `src/world/protocol.rs`). Everything that touches Tauri is behind
// `createCitySession`, so the frame decoder and the region bookkeeping are
// plain functions the tests can drive with bytes.

import { decodeBlob, type Blob as WorldBlob } from './codec';
import { toBytes } from './session';

export const OP_SNAPSHOT = 50;
export const OP_DIFF = 51;

/** What the server's `ready` and `region` messages carry. */
export interface CityReady {
  op: 'ready' | 'reconnected';
  world_session: string;
  user_id: string;
  agent_id: string;
  ent: number;
  region: string;
  tick: number;
  epoch: number;
  map_hash: string;
  spawn: [number, number];
  heartbeat_ms: number;
}

export interface RegionChange {
  op: 'region';
  region: string;
  map_hash: string;
  epoch: number;
  tick: number;
  at: [number, number];
}

export type CityControl =
  | CityReady
  | RegionChange
  | { op: 'error'; code: string; message: string }
  | { op: 'reconnecting'; attempt: number; wait_ms: number }
  | { op: 'pong' }
  | { op: string; [k: string]: unknown };

export interface CityFrame {
  region: string;
  blob: WorldBlob;
}

/** A client input of the server protocol. */
export type CityInput =
  | { type: 'move'; to: [number, number] }
  | { type: 'interact'; object: number }
  | { type: 'say'; text: string }
  | { type: 'wave'; ent: number }
  | { type: 'sit'; object: number }
  | { type: 'idle' }
  | { type: 'enter'; portal: string }
  | { type: 'farm'; cell?: string; tile?: [number, number]; action: 'water' | 'harvest' | 'clear' | 'plant'; crop?: string };

export interface CityChat {
  from_ent: number;
  name: string;
  text: string;
  ts: number;
}

export interface CityAck {
  seq: number;
  status: number;
  code: string;
}

/** `[opcode][len][region id][blob]` → the region and the decoded blob. */
export function decodeCityFrame(bytes: Uint8Array): CityFrame | null {
  if (bytes.length < 2) return null;
  const op = bytes[0];
  if (op !== OP_SNAPSHOT && op !== OP_DIFF) return null;
  const n = bytes[1];
  if (bytes.length < 2 + n) return null;
  const region = new TextDecoder().decode(bytes.subarray(2, 2 + n));
  return { region, blob: decodeBlob(bytes.subarray(2 + n)) };
}

/** Region ids carry `/`; in a REST path they travel percent-encoded. */
export function encodeRegionId(region: string): string {
  return region.replace(/\//g, '%2F');
}

export interface RegionMap {
  id: string;
  kind: number;
  map_hash: string;
  epoch: number;
  revision: number;
  map: unknown;
}

export interface CitySession {
  /** Enters the city; resolves with `ready`. Frames and control messages follow. */
  open(
    onFrame: (frame: CityFrame) => void,
    onControl: (msg: CityControl) => void,
    onError: (code: string) => void,
  ): Promise<CityReady>;
  close(): Promise<void>;
  send(input: CityInput): Promise<number>;
  setInterest(cx: number, cy: number, radius: number): Promise<void>;
  chat(text: string): Promise<void>;
  resync(): Promise<void>;
  onChat(cb: (line: CityChat) => void): () => void;
  onAck(cb: (ack: CityAck) => void): () => void;
  onClosed(cb: (reason: string) => void): () => void;
  api<T = unknown>(method: string, path: string, body?: unknown): Promise<T>;
  dispose(): void;
}

export function createCitySession(opts: { city: string; server?: string | null }): CitySession {
  const stops: Array<() => void> = [];
  async function core() {
    return await import('@tauri-apps/api/core');
  }
  async function events() {
    return await import('@tauri-apps/api/event');
  }
  return {
    async open(onFrame, onControl, onError) {
      const { invoke, Channel } = await core();
      const { listen } = await events();
      const ch = new Channel<unknown>();
      ch.onmessage = (message: unknown) => {
        try {
          const frame = decodeCityFrame(toBytes(message));
          if (frame) onFrame(frame);
        } catch (e) {
          onError(e instanceof Error ? e.message : String(e));
        }
      };
      stops.push(await listen<CityControl>('city://control', (e) => onControl(e.payload)));
      const ready = (await invoke('city_join', { city: opts.city, server: opts.server ?? null, channel: ch })) as CityReady;
      return ready;
    },
    async close() {
      const { invoke } = await core();
      await invoke('city_leave');
    },
    async send(input) {
      const { invoke } = await core();
      return (await invoke('city_input', { input })) as number;
    },
    async setInterest(cx, cy, radius) {
      const { invoke } = await core();
      await invoke('city_interest', { cx: Math.round(cx), cy: Math.round(cy), radius: Math.round(radius) });
    },
    async chat(text) {
      const { invoke } = await core();
      await invoke('city_chat', { text });
    },
    async resync() {
      const { invoke } = await core();
      await invoke('city_resync');
    },
    onChat(cb) {
      let stop: (() => void) | null = null;
      void events().then(async ({ listen }) => {
        stop = await listen<CityChat>('city://chat', (e) => cb(e.payload));
        stops.push(stop);
      });
      return () => stop?.();
    },
    onAck(cb) {
      let stop: (() => void) | null = null;
      void events().then(async ({ listen }) => {
        stop = await listen<CityAck>('city://ack', (e) => cb(e.payload));
        stops.push(stop);
      });
      return () => stop?.();
    },
    onClosed(cb) {
      let stop: (() => void) | null = null;
      void events().then(async ({ listen }) => {
        stop = await listen<{ reason: string }>('city://closed', (e) => cb(e.payload.reason));
        stops.push(stop);
      });
      return () => stop?.();
    },
    async api<T>(method: string, path: string, body?: unknown) {
      const { invoke } = await core();
      return (await invoke('city_api', { method, path, body: body ?? null, server: opts.server ?? null })) as T;
    },
    dispose() {
      for (const stop of stops.splice(0)) stop();
    },
  };
}

/** `GET /api/world/regions/{id}/map`, typed. */
export async function fetchRegionMap(session: CitySession, region: string): Promise<RegionMap> {
  return await session.api<RegionMap>('GET', `/api/world/regions/${encodeRegionId(region)}/map`);
}
