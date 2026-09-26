import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isBareWindow } from "./bare-window";

describe("isBareWindow", () => {
  it("recognises the auxiliary window routes", () => {
    expect(isBareWindow("/limits-strip")).toBe(true);
    expect(isBareWindow("/limits-strip/")).toBe(true);
    expect(isBareWindow("/pet")).toBe(true);
    expect(isBareWindow("/usage-panel")).toBe(true);
  });

  it("keeps the shell everywhere else", () => {
    for (const p of ["/", "/downloads", "/settings", "/llm/accounts", "/limits", "/pets"]) {
      expect(isBareWindow(p)).toBe(false);
    }
  });
});

// Regression: the root layout mounted the recovery/changelog/onboarding
// dialogs and the boot work in every window, so the limits strip opened on a
// clipped "Resume downloads" button. Everything global must sit behind the
// bare-window guard.
describe("root layout guards the auxiliary windows", () => {
  const src = readFileSync(resolve(__dirname, "../routes/+layout.svelte"), "utf8");
  const markup = src.slice(src.indexOf("</script>"));

  it("renders the global dialogs only outside bare windows", () => {
    const guard = markup.indexOf("{#if !bareWindow}");
    expect(guard).toBeGreaterThan(-1);
    for (const tag of ["<Toast", "<McpAuthPrompt", "<CommandPalette", "<RecoveryDialog", "<ChangelogDialog", "<OnboardingWizard", "<LegalDialog"]) {
      const at = markup.indexOf(tag);
      expect(at, tag).toBeGreaterThan(guard);
    }
  });

  it("renders no shell around bare windows", () => {
    expect(markup).toMatch(/\{#if bareWindow\}\s*\{@render children\(\)\}/);
  });

  it("skips the boot work in bare windows", () => {
    expect(src).toMatch(/onMount\(\(\) => \{\s*if \(bareWindow\) return;/);
  });
});
