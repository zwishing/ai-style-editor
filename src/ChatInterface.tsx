import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { stepCountIs, streamText } from "ai";
import type { ChatStatus, LanguageModelUsage, ModelMessage } from "ai";
import type { Map as MapLibreMap } from "maplibre-gl";
import {
  Bot,
  CheckIcon,
  PencilRuler,
  Settings2,
  User,
  Wrench,
  X,
} from "lucide-react";
import { createCompactMapLibreStyleTools } from "@ai-dropdown-demo/maplibre-style-tools";
import { createMoonshotClient, defaultMoonshotApiKey } from "./tools";
import { Button } from "./components/ui/button";
import { ButtonGroup } from "./components/ui/button-group";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "./components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from "./components/ai-elements/attachments";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "./components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "./components/ai-elements/message";
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from "./components/ai-elements/chain-of-thought";
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from "./components/ai-elements/model-selector";
import {
  Context,
  ContextCacheUsage,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextInputUsage,
  ContextOutputUsage,
  ContextReasoningUsage,
  ContextTrigger,
} from "./components/ai-elements/context";
import {
  Plan,
  PlanAction,
  PlanContent,
  PlanDescription,
  PlanHeader,
  PlanTitle,
  PlanTrigger,
} from "./components/ai-elements/plan";
import type { PromptInputMessage } from "./components/ai-elements/prompt-input";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionAddScreenshot,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from "./components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "./components/ai-elements/suggestion";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from "./components/ai-elements/tool";
import {
  compactModelHistory,
  summarizeCompactToolResult,
} from "./chat-history";
import {
  AI_PROVIDER_SETTINGS,
  CHAT_MODES,
  buildChatSystemPrompt,
  emptyProviderApiKeys,
  getProviderApiKey,
  getProviderKeyStorageKey,
  sanitizeProviderApiKeys,
} from "./model-settings";
import type {
  AiProviderId,
  ChatModeId,
  ProviderApiKeys,
} from "./model-settings";
import type { StyleWorkbenchContext } from "./style-workbench-state";

interface ChatInterfaceProps {
  getMap: () => MapLibreMap | null;
  getWorkbenchContext?: () => StyleWorkbenchContext;
  onClose?: () => void;
}

type ToolState = "input-available" | "output-available" | "output-error";

interface ToolEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: ToolState;
  output?: unknown;
  errorText?: string;
}

type ChainEntry =
  | {
      id: string;
      type: "reasoning";
      content: string;
      status: "active" | "complete";
    }
  | {
      id: string;
      type: "tool";
      tool: ToolEntry;
    };

type MessagePart =
  | {
      id: string;
      type: "text";
      content: string;
    }
  | ChainEntry;

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  chain?: ChainEntry[];
  parts?: MessagePart[];
  chainStreaming?: boolean;
}

interface ModelOption {
  chef: string;
  chefSlug: string;
  id: string;
  maxTokens: number;
  name: string;
  providerId: AiProviderId;
  providers: string[];
}

const MODEL_STORAGE_KEY = "ai-style-editor:model";
const CHAT_MODE_STORAGE_KEY = "ai-style-editor:chat-mode";
const API_KEY_STORAGE_KEY = "ai-style-editor:moonshot-api-key";
const STARTER_PROMPTS = [
  "列出当前地图所有图层，并按样式源分组说明",
  "检查当前选中样式源的图层结构",
  "把道路图层改成更亮的蓝色",
];

const models: ModelOption[] = [
  {
    chef: "Moonshot",
    chefSlug: "moonshotai",
    id: "kimi-k2-thinking",
    maxTokens: 262_144,
    name: "Kimi K2 Thinking",
    providerId: "moonshot",
    providers: ["moonshotai"],
  },
  {
    chef: "Moonshot",
    chefSlug: "moonshotai",
    id: "kimi-k2.5",
    maxTokens: 262_144,
    name: "Kimi K2.5",
    providerId: "moonshot",
    providers: ["moonshotai"],
  },
  {
    chef: "Moonshot",
    chefSlug: "moonshotai",
    id: "kimi-k2-turbo-preview",
    maxTokens: 262_144,
    name: "Kimi K2 Turbo",
    providerId: "moonshot",
    providers: ["moonshotai"],
  },
  {
    chef: "Moonshot",
    chefSlug: "moonshotai",
    id: "kimi-latest",
    maxTokens: 262_144,
    name: "Kimi Latest",
    providerId: "moonshot",
    providers: ["moonshotai"],
  },
];

interface AttachmentItemProps {
  attachment: {
    id: string;
    type: "file";
    filename?: string;
    mediaType: string;
    url: string;
  };
  onRemove: (id: string) => void;
}

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  const handleRemove = useCallback(
    () => onRemove(attachment.id),
    [onRemove, attachment.id],
  );

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
}

function PromptInputAttachmentsDisplay() {
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback(
    (id: string) => attachments.remove(id),
    [attachments],
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem
          attachment={attachment}
          key={attachment.id}
          onRemove={handleRemove}
        />
      ))}
    </Attachments>
  );
}

const roleIcon = (role: ChatMessage["role"]) => {
  if (role === "user") return <User className="size-4" />;
  return <Bot className="size-4" />;
};

const roleLabel = (role: ChatMessage["role"]) => {
  if (role === "user") return "用户";
  return "助手";
};

const getStoredValue = (key: string, fallback: string) => {
  if (typeof window === "undefined") return fallback;
  return window.localStorage.getItem(key) ?? fallback;
};

const getStoredChatMode = (): ChatModeId => {
  const stored = getStoredValue(CHAT_MODE_STORAGE_KEY, "edit");
  return stored === "plan" ? "plan" : "edit";
};

const estimateTextTokens = (text: string): number => Math.ceil(text.length / 4);

const estimateModelMessageTokens = (message: ModelMessage): number => {
  if (typeof message.content === "string") {
    return estimateTextTokens(message.content);
  }
  return estimateTextTokens(JSON.stringify(message.content));
};

const estimateModelMessagesTokens = (messages: ModelMessage[]): number =>
  messages.reduce(
    (total, message) => total + estimateModelMessageTokens(message),
    0,
  );

const normalizeUsageForContext = (
  usage: LanguageModelUsage,
): LanguageModelUsage => ({
  ...usage,
  cachedInputTokens:
    usage.cachedInputTokens ?? usage.inputTokenDetails?.cacheReadTokens,
  reasoningTokens:
    usage.reasoningTokens ?? usage.outputTokenDetails?.reasoningTokens,
});

const getUsedContextTokens = (
  usage: LanguageModelUsage | undefined,
  fallback: number,
): number => {
  if (!usage) {
    return fallback;
  }

  return (
    usage.totalTokens ??
    (usage.inputTokens ?? 0) +
      (usage.outputTokens ?? 0) +
      (usage.outputTokenDetails?.reasoningTokens ?? usage.reasoningTokens ?? 0)
  );
};

function PromptSuggestions({
  onSelect,
}: {
  onSelect: (prompt: string) => void;
}) {
  return (
    <Suggestions>
      {STARTER_PROMPTS.map((prompt) => (
        <Suggestion key={prompt} onClick={onSelect} suggestion={prompt} />
      ))}
    </Suggestions>
  );
}

function ToolCompactSummary({ output }: { output: unknown }) {
  if (!output || typeof output !== "object") {
    return null;
  }

  const summary = summarizeCompactToolResult(output);
  if (!summary.startsWith("Tool result:")) {
    return null;
  }

  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs leading-relaxed">
      {summary}
    </div>
  );
}

function ToolCallPanel({ tool }: { tool: ToolEntry }) {
  return (
    <Tool className="mb-0" defaultOpen={false}>
      <ToolHeader
        type="dynamic-tool"
        toolName={tool.toolName}
        state={tool.state}
      />
      <ToolContent>
        <ToolCompactSummary output={tool.output} />
        <ToolInput input={tool.input} />
        <ToolOutput output={tool.output} errorText={tool.errorText} />
      </ToolContent>
    </Tool>
  );
}

const appendReasoningDelta = (
  chain: ChainEntry[],
  text: string,
): ChainEntry[] => {
  if (!text) return chain;

  const last = chain.at(-1);
  if (last?.type === "reasoning" && last.status === "active") {
    return [
      ...chain.slice(0, -1),
      {
        ...last,
        content: last.content + text,
      },
    ];
  }

  return [
    ...chain,
    {
      id: crypto.randomUUID(),
      type: "reasoning",
      content: text,
      status: "active",
    },
  ];
};

const appendTextDelta = (parts: MessagePart[], text: string): MessagePart[] => {
  if (!text) return parts;

  const last = parts.at(-1);
  if (last?.type === "text") {
    return [
      ...parts.slice(0, -1),
      {
        ...last,
        content: last.content + text,
      },
    ];
  }

  return [
    ...parts,
    {
      id: crypto.randomUUID(),
      type: "text",
      content: text,
    },
  ];
};

const appendReasoningPartDelta = (
  parts: MessagePart[],
  text: string,
): MessagePart[] => {
  if (!text) return parts;

  const last = parts.at(-1);
  if (last?.type === "reasoning" && last.status === "active") {
    return [
      ...parts.slice(0, -1),
      {
        ...last,
        content: last.content + text,
      },
    ];
  }

  return [
    ...parts,
    {
      id: crypto.randomUUID(),
      type: "reasoning",
      content: text,
      status: "active",
    },
  ];
};

const completeReasoningEntries = (chain: ChainEntry[]): ChainEntry[] =>
  chain.map((entry) =>
    entry.type === "reasoning" && entry.status === "active"
      ? { ...entry, status: "complete" }
      : entry,
  );

const completeReasoningParts = (parts: MessagePart[]): MessagePart[] =>
  parts.map((entry) =>
    entry.type === "reasoning" && entry.status === "active"
      ? { ...entry, status: "complete" }
      : entry,
  );

const appendToolEntry = (
  chain: ChainEntry[],
  tool: ToolEntry,
): ChainEntry[] => [
  ...completeReasoningEntries(chain),
  {
    id: tool.toolCallId,
    type: "tool",
    tool,
  },
];

const appendToolPart = (
  parts: MessagePart[],
  tool: ToolEntry,
): MessagePart[] => [
  ...completeReasoningParts(parts),
  {
    id: tool.toolCallId,
    type: "tool",
    tool,
  },
];

const updateToolEntry = (
  chain: ChainEntry[],
  toolCallId: string,
  updater: (tool: ToolEntry) => ToolEntry,
): ChainEntry[] =>
  chain.map((entry) =>
    entry.type === "tool" && entry.tool.toolCallId === toolCallId
      ? {
          ...entry,
          tool: updater(entry.tool),
        }
      : entry,
  );

const updateToolPart = (
  parts: MessagePart[],
  toolCallId: string,
  updater: (tool: ToolEntry) => ToolEntry,
): MessagePart[] =>
  parts.map((entry) =>
    entry.type === "tool" && entry.tool.toolCallId === toolCallId
      ? {
          ...entry,
          tool: updater(entry.tool),
        }
      : entry,
  );

const getChainToolCount = (chain: ChainEntry[] = []) =>
  chain.filter((entry) => entry.type === "tool").length;

const getToolEntryIndex = (chain: ChainEntry[], entryId: string) =>
  chain
    .slice(0, chain.findIndex((entry) => entry.id === entryId) + 1)
    .filter((entry) => entry.type === "tool").length;

const getPartToolIndex = (parts: MessagePart[], entryId: string) =>
  parts
    .slice(0, parts.findIndex((entry) => entry.id === entryId) + 1)
    .filter((entry) => entry.type === "tool").length;

const getChainOfThoughtLabel = (
  chain: ChainEntry[] = [],
  isStreaming: boolean,
) => {
  const toolCount = getChainToolCount(chain);
  if (isStreaming) {
    return toolCount > 0 ? `思考中 · ${toolCount} 个工具调用` : "思考中";
  }
  if (toolCount > 0) {
    return `Chain of Thought · ${toolCount} 个工具调用`;
  }
  return "Chain of Thought";
};

const getInlineThoughtLabel = (part: Extract<MessagePart, ChainEntry>) => {
  if (part.type === "reasoning") {
    return part.status === "active" ? "思考中" : "思考";
  }
  return "工具调用";
};

const getToolStepStatus = (state: ToolState) => {
  if (state === "input-available") return "active";
  return "complete";
};

export function ChatInterface({
  getMap,
  getWorkbenchContext,
  onClose,
}: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState(() =>
    getStoredValue(MODEL_STORAGE_KEY, models[0].id),
  );
  const [providerApiKeys, setProviderApiKeys] = useState<ProviderApiKeys>(
    () => {
      const keys = emptyProviderApiKeys();
      for (const provider of AI_PROVIDER_SETTINGS) {
        keys[provider.id] = getStoredValue(
          getProviderKeyStorageKey(provider.id),
          "",
        );
      }
      keys.moonshot =
        keys.moonshot ||
        getStoredValue(API_KEY_STORAGE_KEY, defaultMoonshotApiKey);
      return sanitizeProviderApiKeys(keys);
    },
  );
  const [draftProviderApiKeys, setDraftProviderApiKeys] =
    useState<ProviderApiKeys>(() => sanitizeProviderApiKeys(providerApiKeys));
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [chatMode, setChatMode] = useState<ChatModeId>(getStoredChatMode);
  const [draftInput, setDraftInput] = useState("");
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [status, setStatus] = useState<ChatStatus>("ready");
  const [lastUsage, setLastUsage] = useState<LanguageModelUsage>();
  const [estimatedContextTokens, setEstimatedContextTokens] = useState(0);

  const modelMessagesRef = useRef<ModelMessage[]>([]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);
  }, [model]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHAT_MODE_STORAGE_KEY, chatMode);
  }, [chatMode]);

  const selectedModelData = useMemo(
    () => models.find((m) => m.id === model),
    [model],
  );
  const selectedProviderId = selectedModelData?.providerId ?? "moonshot";
  const effectiveApiKey = getProviderApiKey(
    providerApiKeys,
    selectedProviderId,
  );
  const maxContextTokens = selectedModelData?.maxTokens ?? 262_144;
  const usedContextTokens = Math.min(
    maxContextTokens,
    getUsedContextTokens(lastUsage, estimatedContextTokens),
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sanitized = sanitizeProviderApiKeys(providerApiKeys);
    for (const provider of AI_PROVIDER_SETTINGS) {
      window.localStorage.setItem(
        getProviderKeyStorageKey(provider.id),
        sanitized[provider.id],
      );
    }
    window.localStorage.setItem(API_KEY_STORAGE_KEY, sanitized.moonshot);
  }, [providerApiKeys]);

  const handleModelSelect = useCallback((id: string) => {
    setModel(id);
    setModelSelectorOpen(false);
  }, []);

  const handleSettingsOpenChange = useCallback(
    (open: boolean) => {
      setSettingsOpen(open);
      if (open) {
        setDraftProviderApiKeys(sanitizeProviderApiKeys(providerApiKeys));
      }
    },
    [providerApiKeys],
  );

  const handleDraftProviderApiKeyChange = useCallback(
    (providerId: AiProviderId, value: string) => {
      setDraftProviderApiKeys((current) =>
        sanitizeProviderApiKeys({
          ...current,
          [providerId]: value,
        }),
      );
    },
    [],
  );

  const handleConfirmSettings = useCallback(() => {
    setProviderApiKeys(sanitizeProviderApiKeys(draftProviderApiKeys));
    setSettingsOpen(false);
  }, [draftProviderApiKeys]);

  const handleCancelSettings = useCallback(() => {
    setDraftProviderApiKeys(sanitizeProviderApiKeys(providerApiKeys));
    setSettingsOpen(false);
  }, [providerApiKeys]);

  const handleSubmitButtonClick = useCallback(
    (event: MouseEvent<HTMLButtonElement>) => {
      if (status !== "error") {
        return;
      }

      event.preventDefault();
      setStatus("ready");
    },
    [status],
  );

  const upsertAssistantMessage = (
    assistantMessageId: string,
    updater: (current: ChatMessage | undefined) => ChatMessage,
  ) => {
    setMessages((prev) => {
      const existing = prev.find((m) => m.id === assistantMessageId);
      const nextMessage = updater(existing);
      if (existing) {
        return prev.map((m) => (m.id === assistantMessageId ? nextMessage : m));
      }
      return [...prev, nextMessage];
    });
  };

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const prompt = message.text?.trim() ?? "";
      const hasText = Boolean(prompt);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      if (!effectiveApiKey) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: "请先输入 API Key（会保存在浏览器 localStorage）。",
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: "user",
          content: prompt || "[附件消息]",
        },
      ]);

      setStatus("submitted");

      const provider = createMoonshotClient(effectiveApiKey);
      const styleTools = createCompactMapLibreStyleTools({
        getMap,
        getContext: getWorkbenchContext,
      });
      const tools =
        chatMode === "plan"
          ? {
              getStyleContext: styleTools.getStyleContext,
              searchLayers: styleTools.searchLayers,
              inspectLayersCompact: styleTools.inspectLayersCompact,
            }
          : styleTools;

      try {
        const newUserModelMessage: ModelMessage = {
          role: "user",
          content: prompt || "请处理附带的文件。",
        };
        setEstimatedContextTokens(
          estimateModelMessagesTokens([
            ...modelMessagesRef.current,
            newUserModelMessage,
          ]),
        );
        setLastUsage(undefined);
        const assistantMessageId = crypto.randomUUID();

        const result = await streamText({
          model: provider(model),
          system: buildChatSystemPrompt(chatMode),
          messages: [...modelMessagesRef.current, newUserModelMessage],
          tools,
          stopWhen: stepCountIs(6),
          providerOptions: {
            moonshotai: {
              thinking: {
                type: "enabled",
                budgetTokens: 4096,
              },
              reasoningHistory: "interleaved",
            },
          },
        });

        setStatus("streaming");

        let fullResponse = "";
        const compactToolSummaries: string[] = [];

        for await (const delta of result.fullStream) {
          if (delta.type === "reasoning-start") {
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: "assistant",
              content: current?.content ?? "",
              chain: current?.chain ?? [],
              parts: current?.parts ?? [],
              chainStreaming: true,
            }));
          } else if (delta.type === "reasoning-delta") {
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: "assistant",
              content: current?.content ?? "",
              chain: appendReasoningDelta(current?.chain ?? [], delta.text),
              parts: appendReasoningPartDelta(current?.parts ?? [], delta.text),
              chainStreaming: true,
            }));
          } else if (delta.type === "reasoning-end") {
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: "assistant",
              content: current?.content ?? "",
              chain: completeReasoningEntries(current?.chain ?? []),
              parts: completeReasoningParts(current?.parts ?? []),
              chainStreaming: false,
            }));
          } else if (delta.type === "text-delta") {
            fullResponse += delta.text;
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: "assistant",
              content: fullResponse,
              chain: current?.chain ?? [],
              parts: appendTextDelta(current?.parts ?? [], delta.text),
              chainStreaming: current?.chainStreaming ?? false,
            }));
          } else if (delta.type === "tool-call") {
            upsertAssistantMessage(assistantMessageId, (current) => {
              return {
                id: assistantMessageId,
                role: "assistant",
                content: current?.content ?? fullResponse,
                chain: appendToolEntry(current?.chain ?? [], {
                  toolCallId: delta.toolCallId,
                  toolName: delta.toolName,
                  input: delta.input,
                  state: "input-available",
                }),
                parts: appendToolPart(current?.parts ?? [], {
                  toolCallId: delta.toolCallId,
                  toolName: delta.toolName,
                  input: delta.input,
                  state: "input-available",
                }),
                chainStreaming: true,
              };
            });
          } else if (delta.type === "tool-result") {
            const output = delta.output as
              | { success?: boolean; message?: string }
              | undefined;
            compactToolSummaries.push(summarizeCompactToolResult(output ?? {}));
            upsertAssistantMessage(assistantMessageId, (current) => {
              const success = output?.success !== false;
              const nextState: ToolState = success
                ? "output-available"
                : "output-error";
              const chain = updateToolEntry(
                current?.chain ?? [],
                delta.toolCallId,
                (toolEntry) => ({
                  ...toolEntry,
                  output: delta.output,
                  state: nextState,
                  errorText: success
                    ? undefined
                    : (output?.message ?? "工具执行失败"),
                }),
              );
              const parts = updateToolPart(
                current?.parts ?? [],
                delta.toolCallId,
                (toolEntry) => ({
                  ...toolEntry,
                  output: delta.output,
                  state: nextState,
                  errorText: success
                    ? undefined
                    : (output?.message ?? "工具执行失败"),
                }),
              );
              return {
                ...current,
                id: assistantMessageId,
                role: "assistant",
                content: current?.content ?? fullResponse,
                chain,
                parts,
                chainStreaming: false,
              };
            });
          }
        }

        await result.response;
        const totalUsage = normalizeUsageForContext(await result.totalUsage);
        setLastUsage(totalUsage);
        const compactAssistantMessage: ModelMessage = {
          role: "assistant",
          content: [fullResponse, ...compactToolSummaries]
            .filter(Boolean)
            .join("\n"),
        };
        modelMessagesRef.current = compactModelHistory(
          modelMessagesRef.current,
          [newUserModelMessage, compactAssistantMessage],
          12,
        );

        const finalReasoning = await result.reasoningText;
        if (finalReasoning && finalReasoning.trim()) {
          upsertAssistantMessage(assistantMessageId, (current) => ({
            id: assistantMessageId,
            role: "assistant",
            content: current?.content ?? fullResponse,
            chain: current?.chain?.length
              ? completeReasoningEntries(current.chain)
              : [
                  {
                    id: crypto.randomUUID(),
                    type: "reasoning",
                    content: finalReasoning,
                    status: "complete",
                  },
                ],
            parts: current?.parts?.length
              ? completeReasoningParts(current.parts)
              : [
                  {
                    id: crypto.randomUUID(),
                    type: "reasoning",
                    content: finalReasoning,
                    status: "complete",
                  },
                ],
            chainStreaming: false,
          }));
        }

        setStatus("ready");
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `错误：${error instanceof Error ? error.message : "未知错误"}`,
          },
        ]);
        setStatus("error");
      }
    },
    [chatMode, effectiveApiKey, getMap, getWorkbenchContext, model],
  );

  return (
    <Card className="h-full min-h-0">
      <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-3 border-b">
        <div className="min-w-0">
          <CardTitle>AI 助手</CardTitle>
          <CardDescription>
            使用 AI 对话组件查看、分析并编辑当前激活的地图样式。当前为{""}
            {chatMode === "plan" ? "Plan" : "编辑"}模式。
          </CardDescription>
        </div>
        {onClose ? (
          <CardAction className="self-center">
            <Button
              aria-label="关闭 AI 助手"
              onClick={onClose}
              size="icon"
              type="button"
              variant="ghost"
            >
              <X />
            </Button>
          </CardAction>
        ) : null}
      </CardHeader>

      <CardContent className="min-h-0 flex-1 p-0">
        <div className="flex h-full min-h-0 flex-col">
          <Conversation className="min-h-0 flex-1">
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState>
                  <div className="flex w-full max-w-2xl flex-col gap-4 text-left">
                    <div className="flex flex-col gap-1 text-center">
                      <div className="font-medium text-sm">暂时还没有消息</div>
                      <div className="text-sm text-muted-foreground">
                        你可以直接输入问题，或使用下面的建议提示开始。
                      </div>
                    </div>

                    <ChainOfThought defaultOpen>
                      <ChainOfThoughtHeader>助手工作流程</ChainOfThoughtHeader>
                      <ChainOfThoughtContent>
                        <ChainOfThoughtStep
                          label="读取当前图层"
                          description="助手会先读取当前激活的样式，并定位目标图层。"
                          status="complete"
                        />
                        <ChainOfThoughtStep
                          label="检查目标图层"
                          description="修改前先检查 paint 和 layout 属性，避免误改不熟悉的图层。"
                          status="complete"
                        />
                        <ChainOfThoughtStep
                          label="应用样式修改"
                          description="通过工具调用更新实时地图，然后返回结果确认。"
                          status="complete"
                        />
                      </ChainOfThoughtContent>
                    </ChainOfThought>

                    {chatMode === "plan" ? (
                      <Plan className="rounded-lg" defaultOpen>
                        <PlanHeader>
                          <div className="flex flex-col gap-1">
                            <PlanTitle>Plan 模式</PlanTitle>
                            <PlanDescription>
                              助手会读取图层并给出修改计划，不会直接写入样式。
                            </PlanDescription>
                          </div>
                          <PlanAction>
                            <PlanTrigger />
                          </PlanAction>
                        </PlanHeader>
                        <PlanContent>
                          <div className="text-sm text-muted-foreground">
                            适合先确认目标图层、颜色、可见性和风险，再切回编辑模式执行。
                          </div>
                        </PlanContent>
                      </Plan>
                    ) : null}

                    <PromptSuggestions onSelect={setDraftInput} />
                  </div>
                </ConversationEmptyState>
              ) : (
                messages.map((msg) => (
                  <Message
                    from={msg.role === "user" ? "user" : "assistant"}
                    key={msg.id}
                  >
                    <div
                      className={
                        msg.role === "user"
                          ? "flex items-center justify-end gap-2 text-xs text-muted-foreground"
                          : "flex items-center gap-2 text-xs text-muted-foreground"
                      }
                    >
                      {roleIcon(msg.role)}
                      <span>{roleLabel(msg.role)}</span>
                    </div>

                    <MessageContent>
                      {msg.role === "assistant" && msg.parts?.length ? (
                        <div className="flex flex-col gap-4">
                          {msg.parts.map((part) => {
                            if (part.type === "text") {
                              return (
                                <MessageResponse key={part.id}>
                                  {part.content}
                                </MessageResponse>
                              );
                            }

                            if (part.type === "reasoning") {
                              return (
                                <ChainOfThought
                                  defaultOpen={part.status === "active"}
                                  key={part.id}
                                >
                                  <ChainOfThoughtHeader>
                                    {getInlineThoughtLabel(part)}
                                  </ChainOfThoughtHeader>
                                  <ChainOfThoughtContent>
                                    <ChainOfThoughtStep
                                      label="思考片段"
                                      status={part.status}
                                    >
                                      <MessageResponse>
                                        {part.content}
                                      </MessageResponse>
                                    </ChainOfThoughtStep>
                                  </ChainOfThoughtContent>
                                </ChainOfThought>
                              );
                            }

                            const toolIndex = getPartToolIndex(
                              msg.parts ?? [],
                              part.id,
                            );

                            return (
                              <ChainOfThought defaultOpen key={part.id}>
                                <ChainOfThoughtHeader>
                                  {getInlineThoughtLabel(part)}
                                </ChainOfThoughtHeader>
                                <ChainOfThoughtContent>
                                  <ChainOfThoughtStep
                                    icon={Wrench}
                                    label={`工具调用 ${toolIndex}：${part.tool.toolName}`}
                                    status={getToolStepStatus(part.tool.state)}
                                  >
                                    <ToolCallPanel tool={part.tool} />
                                  </ChainOfThoughtStep>
                                </ChainOfThoughtContent>
                              </ChainOfThought>
                            );
                          })}
                        </div>
                      ) : msg.role === "assistant" && msg.chain?.length ? (
                        <>
                          <ChainOfThought
                            className="mb-4"
                            defaultOpen={Boolean(
                              msg.chainStreaming || msg.chain.length,
                            )}
                          >
                            <ChainOfThoughtHeader>
                              {getChainOfThoughtLabel(
                                msg.chain,
                                Boolean(msg.chainStreaming),
                              )}
                            </ChainOfThoughtHeader>
                            <ChainOfThoughtContent>
                              <div className="flex flex-col gap-3">
                                {msg.chain.map((entry) => {
                                  if (entry.type === "reasoning") {
                                    return (
                                      <ChainOfThoughtStep
                                        key={entry.id}
                                        label="思考片段"
                                        status={entry.status}
                                      >
                                        <MessageResponse>
                                          {entry.content}
                                        </MessageResponse>
                                      </ChainOfThoughtStep>
                                    );
                                  }

                                  const toolIndex = getToolEntryIndex(
                                    msg.chain ?? [],
                                    entry.id,
                                  );

                                  return (
                                    <ChainOfThoughtStep
                                      icon={Wrench}
                                      key={entry.id}
                                      label={`工具调用 ${toolIndex}：${entry.tool.toolName}`}
                                      status={getToolStepStatus(
                                        entry.tool.state,
                                      )}
                                    >
                                      <ToolCallPanel tool={entry.tool} />
                                    </ChainOfThoughtStep>
                                  );
                                })}
                              </div>
                            </ChainOfThoughtContent>
                          </ChainOfThought>
                          {msg.content ? (
                            <MessageResponse>{msg.content}</MessageResponse>
                          ) : null}
                        </>
                      ) : msg.content ? (
                        <MessageResponse>{msg.content}</MessageResponse>
                      ) : null}
                    </MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t px-4 py-4">
            <div className="flex flex-col gap-3">
              {messages.length > 0 ? (
                <PromptSuggestions onSelect={setDraftInput} />
              ) : null}

              <PromptInput
                globalDrop
                multiple
                onSubmit={async (message) => {
                  setDraftInput("");
                  await handleSubmit(message);
                }}
              >
                <PromptInputAttachmentsDisplay />
                <PromptInputBody>
                  <PromptInputTextarea
                    onChange={(event) => setDraftInput(event.target.value)}
                    placeholder="输入你的地图样式需求，或让助手分析当前样式…"
                    value={draftInput}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                        <PromptInputActionAddScreenshot />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>

                    <ButtonGroup>
                      {CHAT_MODES.map((modeOption) => (
                        <Button
                          aria-pressed={chatMode === modeOption.id}
                          key={modeOption.id}
                          onClick={() => setChatMode(modeOption.id)}
                          size="sm"
                          type="button"
                          variant={
                            chatMode === modeOption.id ? "secondary" : "ghost"
                          }
                        >
                          {modeOption.id === "edit" ? (
                            <Wrench />
                          ) : (
                            <PencilRuler className="size-3.5" />
                          )}
                          {modeOption.label}
                        </Button>
                      ))}
                    </ButtonGroup>

                    <ModelSelector
                      onOpenChange={setModelSelectorOpen}
                      open={modelSelectorOpen}
                    >
                      <ModelSelectorTrigger
                        render={
                          <Button
                            className="min-w-36 justify-between"
                            type="button"
                            variant="outline"
                          >
                            {selectedModelData?.chefSlug ? (
                              <ModelSelectorLogo
                                provider={selectedModelData.chefSlug}
                              />
                            ) : null}
                            {selectedModelData?.name ? (
                              <ModelSelectorName>
                                {selectedModelData.name}
                              </ModelSelectorName>
                            ) : null}
                          </Button>
                        }
                      />

                      <ModelSelectorContent>
                        <ModelSelectorInput placeholder="搜索模型..." />
                        <ModelSelectorList>
                          <ModelSelectorEmpty>
                            没有找到模型。
                          </ModelSelectorEmpty>
                          {["Moonshot"].map((chef) => (
                            <ModelSelectorGroup heading={chef} key={chef}>
                              {models
                                .filter((m) => m.chef === chef)
                                .map((m) => (
                                  <ModelSelectorItem
                                    key={m.id}
                                    onSelect={() => handleModelSelect(m.id)}
                                    value={m.id}
                                  >
                                    <ModelSelectorLogo provider={m.chefSlug} />
                                    <ModelSelectorName>
                                      {m.name}
                                    </ModelSelectorName>
                                    <ModelSelectorLogoGroup>
                                      {m.providers.map((provider) => (
                                        <ModelSelectorLogo
                                          key={provider}
                                          provider={provider}
                                        />
                                      ))}
                                    </ModelSelectorLogoGroup>
                                    {model === m.id ? (
                                      <CheckIcon className="ml-auto" />
                                    ) : (
                                      <div className="ml-auto size-4" />
                                    )}
                                  </ModelSelectorItem>
                                ))}
                            </ModelSelectorGroup>
                          ))}
                        </ModelSelectorList>
                      </ModelSelectorContent>
                    </ModelSelector>

                    <Dialog
                      onOpenChange={handleSettingsOpenChange}
                      open={settingsOpen}
                    >
                      <DialogTrigger
                        render={
                          <Button
                            aria-label="打开模型设置"
                            size="icon"
                            type="button"
                            variant="outline"
                          />
                        }
                      >
                        <Settings2 className="size-4" />
                      </DialogTrigger>
                      <DialogContent className="sm:max-w-lg">
                        <DialogHeader>
                          <DialogTitle>模型设置</DialogTitle>
                          <DialogDescription>
                            API Key 仅保存在当前浏览器
                            localStorage。当前请求使用所选模型对应的 provider
                            key。
                          </DialogDescription>
                        </DialogHeader>
                        <div className="grid gap-3">
                          {AI_PROVIDER_SETTINGS.map((provider) => (
                            <label className="grid gap-1.5" key={provider.id}>
                              <span className="text-sm font-medium">
                                {provider.label}
                              </span>
                              <Input
                                autoComplete="off"
                                onChange={(event) =>
                                  handleDraftProviderApiKeyChange(
                                    provider.id,
                                    event.target.value,
                                  )
                                }
                                placeholder={provider.placeholder}
                                type="password"
                                value={draftProviderApiKeys[provider.id]}
                              />
                            </label>
                          ))}
                        </div>
                        <DialogFooter>
                          <Button
                            onClick={handleCancelSettings}
                            type="button"
                            variant="outline"
                          >
                            取消
                          </Button>
                          <Button onClick={handleConfirmSettings} type="button">
                            确认
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>

                    <Context
                      maxTokens={maxContextTokens}
                      modelId={model}
                      usage={lastUsage}
                      usedTokens={usedContextTokens}
                    >
                      <ContextTrigger
                        aria-label="查看上下文用量"
                        className="h-8 gap-2"
                      />
                      <ContextContent side="top" align="start">
                        <ContextContentHeader />
                        <ContextContentBody className="space-y-2">
                          <ContextInputUsage />
                          <ContextOutputUsage />
                          <ContextReasoningUsage />
                          <ContextCacheUsage />
                          {!lastUsage ? (
                            <div className="text-xs text-muted-foreground">
                              当前显示发送前的粗略上下文估算，完成一次回复后会显示模型返回的
                              token 用量。
                            </div>
                          ) : null}
                        </ContextContentBody>
                        <ContextContentFooter />
                      </ContextContent>
                    </Context>
                  </PromptInputTools>

                  <PromptInputSubmit
                    status={status}
                    disabled={!effectiveApiKey}
                    onClick={handleSubmitButtonClick}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
