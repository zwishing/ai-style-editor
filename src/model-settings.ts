export type AiProviderId =
  | "moonshot"
  | "openai"
  | "anthropic"
  | "google"
  | "deepseek"
  | "openrouter";

export interface AiProviderSetting {
  id: AiProviderId;
  label: string;
  placeholder: string;
}

export type ProviderApiKeys = Record<AiProviderId, string>;

export type ChatModeId = "edit" | "plan";

export interface ChatModeOption {
  id: ChatModeId;
  label: string;
  description: string;
}

export const AI_PROVIDER_SETTINGS: AiProviderSetting[] = [
  {
    id: "moonshot",
    label: "Moonshot",
    placeholder: "sk-...",
  },
  {
    id: "openai",
    label: "OpenAI",
    placeholder: "sk-...",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    placeholder: "sk-ant-...",
  },
  {
    id: "google",
    label: "Google AI",
    placeholder: "AIza...",
  },
  {
    id: "deepseek",
    label: "DeepSeek",
    placeholder: "sk-...",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    placeholder: "sk-or-...",
  },
];

export const CHAT_MODES: ChatModeOption[] = [
  {
    id: "edit",
    label: "编辑",
    description: "允许助手分析并直接修改当前样式。",
  },
  {
    id: "plan",
    label: "Plan",
    description: "只生成修改计划，不直接写入地图样式。",
  },
];

export const emptyProviderApiKeys = (): ProviderApiKeys => ({
  moonshot: "",
  openai: "",
  anthropic: "",
  google: "",
  deepseek: "",
  openrouter: "",
});

export const getProviderKeyStorageKey = (providerId: AiProviderId) =>
  `ai-style-editor:provider-key:${providerId}`;

export const sanitizeProviderApiKeys = (
  keys: Partial<ProviderApiKeys>,
): ProviderApiKeys => {
  const sanitized = emptyProviderApiKeys();
  for (const provider of AI_PROVIDER_SETTINGS) {
    sanitized[provider.id] = keys[provider.id]?.trim() ?? "";
  }
  return sanitized;
};

export const getProviderApiKey = (
  keys: Partial<ProviderApiKeys>,
  providerId: AiProviderId,
) => keys[providerId]?.trim() ?? "";

export const buildChatSystemPrompt = (mode: ChatModeId): string => {
  const basePrompt =
    "You are a MapLibre style assistant. " +
    "You must support ALL currently loaded layers, including basemap layers from style.json. " +
    "Prefer compact tools: use getStyleContext for overview, searchLayers for ambiguous targets, inspectLayersCompact for focused inspection. " +
    "When you need a tool, finish the current reasoning sentence before the tool call, then continue with a new reasoning sentence after the tool result. " +
    "Do not request or repeat full style JSON unless explicitly needed. ";

  if (mode === "plan") {
    return (
      basePrompt +
      "Plan mode is read-only. Do not call applyStyleOperations. " +
      "Return an implementation plan with target layer ids, properties to inspect, and proposed paint/layout changes. " +
      "Ask for confirmation before any edit."
    );
  }

  return (
    basePrompt +
    "For edits, use applyStyleOperations after focused inspection. " +
    "After edits, summarize changed layer ids and the compact diff only."
  );
};
