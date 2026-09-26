import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import ts from 'typescript';
import { compileModule } from 'svelte/compiler';
import { expect, it } from 'vitest';
it('shares subscriptions, rolls back failed saves and releases late listeners', () => {
  const source = readFileSync('src/lib/stores/limits-monitor.svelte.ts','utf8').replace(/^import .*;\n/gm,'');
  const compiled = compileModule(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext } }).outputText, { filename: 'limits-monitor.svelte.js', generate: 'client' }).js.code;
  const result = spawnSync(process.execPath,['--conditions=browser','--input-type=module'], { cwd: process.cwd(), encoding:'utf8', input: `
    import assert from 'node:assert/strict';
    let subscriptions = 0, stops = 0, fail = false;
    const value = { prefs: { enabled:false, providers:[] }, providers:[], open:false };
    async function listen() { subscriptions++; return () => stops++; }
    async function invoke(name, args) {
      if (name === 'limits_strip_set_prefs') { if (fail) throw new Error('disk full'); return { ...value, prefs: args.prefs }; }
      return name === 'limits_strip_state' ? {rings:[]} : value;
    }
    ${compiled}
    const tick = () => new Promise(r => setImmediate(r));
    const a = acquireLimitsMonitor(), b = acquireLimitsMonitor(); await tick();
    assert.equal(subscriptions,2); a(); assert.equal(stops,0);
    fail = true; assert.equal(await saveLimitsPrefs({...getLimitsMonitor().prefs,enabled:true}),false);
    assert.equal(getLimitsMonitor().prefs.enabled,false);
    fail = false; assert.equal(await saveLimitsPrefs({...getLimitsMonitor().prefs,enabled:true}),true);
    assert.equal(getLimitsMonitor().prefs.enabled,true);
    b(); assert.equal(stops,2);
    const c = acquireLimitsMonitor(); c(); await tick(); assert.equal(stops,3);
  ` });
  expect(result.status, result.stderr).toBe(0);
});
