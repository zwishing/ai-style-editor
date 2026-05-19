import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AI_PROVIDER_SETTINGS,
  CHAT_MODES,
  buildChatSystemPrompt,
  getProviderApiKey,
  getProviderKeyStorageKey,
  sanitizeProviderApiKeys,
} from "./model-settings.js";

describe("model settings", () => {
  it("defines common model provider key slots", () => {
    assert.deepEqual(
      AI_PROVIDER_SETTINGS.map((provider) => provider.id),
      ["moonshot", "openai", "anthropic", "google", "deepseek", "openrouter"],
    );
  });

  it("uses stable provider key localStorage names", () => {
    assert.equal(
      getProviderKeyStorageKey("moonshot"),
      "ai-style-editor:provider-key:moonshot",
    );
  });

  it("trims provider api keys before use", () => {
    const keys = sanitizeProviderApiKeys({
      moonshot: "  sk-moonshot  ",
      openai: "",
      anthropic: "  ",
      google: "AIza",
      deepseek: "  sk-deepseek",
      openrouter: "sk-or",
    });

    assert.equal(getProviderApiKey(keys, "moonshot"), "sk-moonshot");
    assert.equal(getProviderApiKey(keys, "anthropic"), "");
    assert.equal(getProviderApiKey(keys, "deepseek"), "sk-deepseek");
  });

  it("adds a plan mode alongside edit mode", () => {
    assert.deepEqual(
      CHAT_MODES.map((mode) => mode.id),
      ["edit", "plan"],
    );
  });

  it("makes plan mode read-only in the system prompt", () => {
    const prompt = buildChatSystemPrompt("plan");

    assert.match(prompt, /Plan mode/i);
    assert.match(prompt, /Do not call applyStyleOperations/i);
    assert.match(prompt, /Return an implementation plan/i);
  });
});
