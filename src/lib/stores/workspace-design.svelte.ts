/** Device-local visual preferences, isolated from backend and other modules. */
export const PRESETS = [
  {
    "id": "amber-minimal",
    "name": "Amber Minimal",
    "colors": [
      "#ffffff",
      "#f59e0b",
      "#171717"
    ]
  },
  {
    "id": "orange-soft",
    "name": "Orange Soft",
    "colors": [
      "#ffffff",
      "#bd4500",
      "#121113"
    ]
  },
  {
    "id": "claude-amber",
    "name": "Claude Amber",
    "colors": [
      "#faf9f5",
      "#c96442",
      "#262624"
    ]
  },
  {
    "id": "amber-hearth",
    "name": "Amber Hearth",
    "colors": [
      "#ffffff",
      "#d87943",
      "#121113"
    ]
  },
  {
    "id": "amber-slate",
    "name": "Amber Slate",
    "colors": [
      "#e8ebed",
      "#df6035",
      "#1a1a1a"
    ]
  },
  {
    "id": "orange-vivid",
    "name": "Orange Vivid",
    "colors": [
      "#e8ebed",
      "#e37e31",
      "#1a1a1a"
    ]
  }
] as const;
export type Preset = typeof PRESETS[number]["id"];
export type Mode = "system" | "light" | "dark";
const KEY = "omniget.workspace.appearance.v1";
let preset = $state<Preset>("amber-minimal");
let mode = $state<Mode>("system");
let systemDark = $state(true);
export function getWorkspaceDesign() { return { preset, mode, systemDark, resolvedMode: mode === "system" ? (systemDark ? "dark" : "light") : mode }; }
export function initWorkspaceDesign() {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const sync = () => { systemDark = media.matches; };
  sync(); media.addEventListener("change", sync);
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (saved && PRESETS.some(p => p.id === saved.preset)) preset = saved.preset;
    if (["system", "light", "dark"].includes(saved?.mode)) mode = saved.mode;
  } catch { /* Keep usable defaults if storage is unavailable. */ }
  return () => media.removeEventListener("change", sync);
}
export function saveWorkspaceDesign(nextPreset: Preset, nextMode: Mode): boolean {
  try { localStorage.setItem(KEY, JSON.stringify({ preset: nextPreset, mode: nextMode })); }
  catch { return false; }
  preset = nextPreset; mode = nextMode; return true;
}
