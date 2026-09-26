import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import ts from "typescript";
import { compileModule } from "svelte/compiler";
import { expect, it } from "vitest";

// Compile the real rune module: replacing $state with an identity function
// would hide the proxy-identity bug this regression test must catch.
const filename = resolve("src/lib/stores/toolbar-store.svelte.ts");
const source = ts.transpileModule(readFileSync(filename, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.ESNext },
}).outputText;
const compiled = compileModule(source, { filename, generate: "client" }).js.code;

it("cleans up the active registration without deleting a newer toolbar", () => {
  const result = spawnSync(process.execPath, ["--conditions=browser", "--input-type=module"], {
    input: `${compiled}
      import assert from 'node:assert/strict';
      const first = { segments: [{id:'downloads',label:'Downloads'}], actions: [{id:'clear',label:'Clear',onClick(){}}] };
      const cleanFirst = setToolbar(first);
      assert.notEqual(getToolbar(), first, 'test must exercise the Svelte proxy');
      cleanFirst();
      assert.deepEqual(getToolbar(), {});
      const cleanOld = setToolbar(first);
      const cleanNew = setToolbar({segments:[{id:'marketplace',label:'Marketplace'}]});
      cleanOld();
      assert.equal(getToolbar().segments[0].id, 'marketplace');
      cleanNew();
      assert.deepEqual(getToolbar(), {});
      const cleanBeforeClear = setToolbar(first);
      clearToolbar();
      const cleanReused = setToolbar(first);
      cleanBeforeClear();
      assert.equal(getToolbar().segments[0].id, 'downloads');
      cleanReused(); cleanReused();
      assert.deepEqual(getToolbar(), {});
    `,
    encoding: "utf8",
    cwd: process.cwd(),
  });
  expect(result.status, result.stderr || String(result.error ?? "")).toBe(0);
});
