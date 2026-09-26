import { describe, expect, it } from "vitest";
import { agentPrompts, type AgentPrompts, type TranslationBag } from "./agent-prompts";

const KEYS: Array<keyof AgentPrompts> = [
  "omni",
  "builder",
  "scout",
  "templateChief",
  "templateResearcher",
  "templateWriter",
  "templateEm",
  "templateReviewer",
  "help",
];

const ENGLISH: Record<string, string> = {
  "llm.prompts.omni": "You are Omni, the assistant inside OmniGet.",
  "llm.prompts.builder": "You are Builder, the coding agent inside OmniGet.",
  "llm.prompts.scout": "You are Scout, the reading and research agent inside OmniGet.",
  "llm.prompts.template_chief": "You run the user's day.",
  "llm.prompts.template_researcher": "You gather facts.",
  "llm.prompts.template_writer": "You turn notes into short, plain prose.",
  "llm.prompts.template_em": "You plan the work.",
  "llm.prompts.template_reviewer": "You review a change for correctness first.",
  "llm.prompts.help": "You are OmniGet Help.",
};

const BAG: TranslationBag = {
  en: ENGLISH,
  ru: { "llm.prompts.omni": "Ты — Omni, ассистент внутри OmniGet." },
};

describe("agentPrompts", () => {
  it("returns every prompt the backend seeds", () => {
    const prompts = agentPrompts(BAG, "en");
    expect(Object.keys(prompts).sort()).toEqual([...KEYS].sort());
  });

  it("prefers the active locale and falls back to English per key", () => {
    const prompts = agentPrompts(BAG, "ru");
    expect(prompts.omni).toBe("Ты — Omni, ассистент внутри OmniGet.");
    expect(prompts.help).toBe(ENGLISH["llm.prompts.help"]);
  });

  it("falls back to English for a locale the bag does not carry", () => {
    const prompts = agentPrompts(BAG, "de");
    expect(prompts.builder).toBe(ENGLISH["llm.prompts.builder"]);
  });

  it("never sends an empty string: the key is the last resort", () => {
    const prompts = agentPrompts(undefined, "ru");
    expect(prompts.scout).toBe("llm.prompts.scout");
    expect(Object.values(prompts).every((value) => value.length > 0)).toBe(true);
  });

  it("ignores an empty translation instead of blanking a prompt", () => {
    const prompts = agentPrompts({ en: ENGLISH, ru: { "llm.prompts.scout": "" } }, "ru");
    expect(prompts.scout).toBe(ENGLISH["llm.prompts.scout"]);
  });

  it("keeps the placeholder-free prose verbatim", () => {
    const prompts = agentPrompts(BAG, "en");
    expect(prompts.omni).toBe(ENGLISH["llm.prompts.omni"]);
    expect(prompts.omni).not.toMatch(/^\s|\s$/);
  });
});
