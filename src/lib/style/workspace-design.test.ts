import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const css = readFileSync("src/lib/style/workspace-design.css", "utf8");
const presets = [...css.matchAll(/\[data-ds-preset="([^"]+)"\]\[data-ds-mode="([^"]+)"\] \{([^}]+)\}/g)];
function rgb(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255); }
function luminance(rgb: number[]) {
  return rgb.map(c => c <= .04045 ? c / 12.92 : ((c + .055) / 1.055) ** 2.4)
    .reduce((s, c, i) => s + c * [.2126, .7152, .0722][i], 0);
}
function contrast(a: number[], b: number[]) {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + .05) / (low + .05);
}
it("covers all six presets in light and dark mode", () => expect(presets).toHaveLength(12));
for (const [, preset, mode, block] of presets) {
  it(`${preset} ${mode}: surface links, tool text, caret and focus remain visible`, () => {
    const tokens = Object.fromEntries([...block.matchAll(/--ds-([\w-]+):\s*([^;]+);/g)].map(m => [m[1], m[2]]));
    const resolve = (key: string): string => tokens[key].startsWith("var(")
      ? resolve(tokens[key].slice(9, -1)) : tokens[key];
    for (const text of ["foreground", "muted-foreground"]) {
      for (const surface of ["background", "card", "muted", "popover"]) {
        expect(contrast(rgb(resolve(text)), rgb(resolve(surface))), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    const ink = rgb(resolve("surface-accent"));
    for (const surface of ["background", "card", "muted", "popover"]) {
      expect(contrast(ink, rgb(resolve(surface))), surface).toBeGreaterThanOrEqual(4.5);
    }
    const soft = rgb(resolve("primary")).map((c, i) => .12 * c + .88 * rgb(resolve("background"))[i]);
    expect(contrast(ink, soft), "soft selection").toBeGreaterThanOrEqual(4.5);
    expect(contrast(rgb(resolve("accent-foreground")), rgb(resolve("accent"))), "filled selection").toBeGreaterThanOrEqual(4.5);
  });
}
it("binds surface text and keyboard focus to the surface token", () => {
  expect(css).toContain("--accent-hi: var(--ds-surface-accent)");
  expect(css).toContain("--accent-text: var(--ds-surface-accent)");
  expect(css).toContain("outline: 2px solid var(--ds-surface-accent)");
});
