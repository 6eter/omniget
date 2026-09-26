import { describe, it, expect } from 'vitest';
import { parseCommand } from './connection-setup';
describe('ACP arguments', () => {
  it('preserves spaces in executable and arguments', () => expect(parseCommand('"/path with spaces/agent" --config "a b.json"')).toEqual(['/path with spaces/agent', '--config', 'a b.json']));
  it('preserves Windows path separators', () => expect(parseCommand(String.raw`"C:\Program Files\agent.exe" --acp`)).toEqual([String.raw`C:\Program Files\agent.exe`, '--acp']));
  it('preserves empty arguments and never interprets shell syntax', () => expect(parseCommand("agent '' '$HOME' ';'")).toEqual(['agent', '', '$HOME', ';']));
  it('rejects unterminated quoting instead of changing argv', () => expect(() => parseCommand('agent "bad')).toThrow());
});

import { vi, beforeEach } from 'vitest';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { testConnection } from './connection-setup';
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/event', () => ({ listen: vi.fn() }));
describe('connection verification', () => {
  let receive: (e: { payload: unknown }) => void;
  const cleanup = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listen).mockImplementation(async (_event, callback) => { receive = callback as typeof receive; return cleanup; });
  });
  it('accepts real reply events that arrive before start IPC resolves', async () => {
    vi.mocked(invoke).mockImplementation(async () => {
      receive({ payload: { request_id: 'r', event: { type: 'text_delta', text: 'OK' } } });
      receive({ payload: { request_id: 'r', event: { type: 'finished', reason: 'stop' } } });
      return { request_id: 'r' };
    });
    await expect(testConnection('agent', new AbortController().signal)).resolves.toBeUndefined();
    expect(cleanup).toHaveBeenCalledOnce();
  });
  it('cancels promptly during pending IPC and cancels the eventual runtime request', async () => {
    let release!: (value: { request_id: string }) => void;
    vi.mocked(invoke).mockImplementation(async command => command === 'llm_turn_start'
      ? await new Promise(resolve => { release = resolve; }) : { ok: true });
    const abort = new AbortController();
    const pending = testConnection('agent', abort.signal);
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    abort.abort();
    await expect(pending).rejects.toThrow('cancelled');
    expect(cleanup).toHaveBeenCalledOnce();
    release({ request_id: 'late' });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith('llm_turn_cancel', { requestId: 'late' }));
  });
  it('does not mark ready when runtime finishes without a response', async () => {
    vi.mocked(invoke).mockImplementation(async () => {
      receive({ payload: { request_id: 'r', event: { type: 'finished', reason: 'stop' } } });
      return { request_id: 'r' };
    });
    await expect(testConnection('agent', new AbortController().signal)).rejects.toThrow('incomplete');
    expect(cleanup).toHaveBeenCalledOnce();
  });
});

import { parseConnectionDraft } from './connection-setup';
describe('persistent setup metadata', () => {
  const draft = { version: 1, mode: 'api', step: 2, cli: 'claude', account: '', name: 'Work', provider: 'openai', models: ['m'], model: 'm', loginOpened: false, agentId: '', attempt: '00000000-0000-4000-8000-000000000000', credentialId: 'setup-00000000-0000-4000-8000-000000000000' };
  it('whitelists metadata and never restores secrets or ready', () => {
    const saved = parseConnectionDraft({ ...draft, key: 'secret', verified: true });
    expect(saved).toEqual(draft);
    expect(saved).not.toHaveProperty('key');
    expect(saved).not.toHaveProperty('verified');
  });
  it('rejects malformed, future and inconsistent drafts', () => {
    expect(parseConnectionDraft({ ...draft, version: 2 })).toBeNull();
    expect(parseConnectionDraft({ ...draft, models: ['ok', null] })).toBeNull();
    expect(parseConnectionDraft({ ...draft, step: 3 })).toBeNull();
    expect(parseConnectionDraft({ ...draft, attempt: '../../bad' })).toBeNull();
  });
});


import { connectionMatchesIntent, CONNECTION_TOKEN_LIMIT } from './connection-setup';
import type { AgentDef } from './types';
it('rejects resumed test-only limits instead of claiming a normal agent is ready', () => {
  const expected: AgentDef = { id: 'a', name: 'Agent', role: 'worker', system_prompt: '', model: { policy: 'fixed', model: { provider: 'ollama', model: 'm' } }, runtime: { kind: 'native' }, tools: [], skills: [], budget: { tokens_per_turn: CONNECTION_TOKEN_LIMIT, max_tool_calls_per_turn: 0 } };
  expect(connectionMatchesIntent(expected, expected)).toBe(true);
  expect(connectionMatchesIntent({ ...expected, budget: { tokens_per_turn: 256 } }, expected)).toBe(false);
  expect(connectionMatchesIntent({ ...expected, runtime: { kind: 'cli', cli: 'codex', account: 'different' } }, expected)).toBe(false);
});
