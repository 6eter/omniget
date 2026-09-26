import { afterEach, describe, expect, it, vi } from "vitest";
import { isLocalModelProvider, loadProviderModels } from "./provider-models";
const invoke = vi.hoisted(() => vi.fn());
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
afterEach(() => invoke.mockReset());

describe("llm_models_list contract", () => {
  it.each([false, true])("reads the Tauri response object (cached: %s)", async (cached) => {
    invoke.mockResolvedValue({ provider: "ollama", models: ["qwen3:8b", "qwen3:0.6b"], cached });
    expect(await loadProviderModels("ollama")).toEqual(["qwen3:8b", "qwen3:0.6b"]);
    expect(invoke).toHaveBeenCalledWith("llm_models_list", { provider: "ollama" });
  });
  it("keeps an empty successful result distinct from an error", async () => {
    invoke.mockResolvedValue({ provider: "ollama", models: [], cached: false });
    expect(await loadProviderModels("ollama")).toEqual([]);
    invoke.mockRejectedValue("ERR_LLM_MODELS: provider offline");
    await expect(loadProviderModels("ollama")).rejects.toBe("ERR_LLM_MODELS: provider offline");
  });
  it.each([null, ["model"], { provider: "openai", models: ["wrong-provider"], cached: false }, { provider: "ollama", models: [123], cached: false }])("rejects an invalid response: %j", async response => {
    invoke.mockResolvedValue(response);
    await expect(loadProviderModels("ollama")).rejects.toThrow("ERR_LLM_MODELS_RESPONSE");
  });
  it("does not require saved credentials for the three local server kinds", () => {
    for (const provider of ["ollama", "lmstudio", "llama-server"]) expect(isLocalModelProvider(provider)).toBe(true);
    expect(isLocalModelProvider("openai")).toBe(false);
  });
});
