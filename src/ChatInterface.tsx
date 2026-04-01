import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { stepCountIs, streamText } from 'ai';
import type { ChatStatus, ModelMessage } from 'ai';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { Bot, CheckIcon, KeyRound, User, Wrench, X } from 'lucide-react';
import { createMapLibreStyleTools } from '@ai-dropdown-demo/maplibre-style-tools';
import { createMoonshotClient, defaultMoonshotApiKey } from './tools';
import { Button } from './components/ui/button';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from './components/ui/input-group';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from './components/ai-elements/attachments';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from './components/ai-elements/conversation';
import { Message, MessageContent, MessageResponse } from './components/ai-elements/message';
import {
  ChainOfThought,
  ChainOfThoughtContent,
  ChainOfThoughtHeader,
  ChainOfThoughtStep,
} from './components/ai-elements/chain-of-thought';
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
} from './components/ai-elements/model-selector';
import type { PromptInputMessage } from './components/ai-elements/prompt-input';
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
} from './components/ai-elements/prompt-input';
import { Reasoning, ReasoningContent, ReasoningTrigger } from './components/ai-elements/reasoning';
import { Suggestion, Suggestions } from './components/ai-elements/suggestion';
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from './components/ai-elements/tool';

interface ChatInterfaceProps {
  getMap: () => MapLibreMap | null;
  onClose?: () => void;
}

type ToolState = 'input-available' | 'output-available' | 'output-error';

interface ToolEntry {
  toolCallId: string;
  toolName: string;
  input: unknown;
  state: ToolState;
  output?: unknown;
  errorText?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool';
  content: string;
  reasoning?: string;
  reasoningStreaming?: boolean;
  tool?: ToolEntry;
}

interface ModelOption {
  chef: string;
  chefSlug: string;
  id: string;
  name: string;
  providers: string[];
}

const MODEL_STORAGE_KEY = 'ai-style-editor:model';
const API_KEY_STORAGE_KEY = 'ai-style-editor:moonshot-api-key';
const STARTER_PROMPTS = [
  '列出当前地图所有图层，并按样式源分组说明',
  '检查当前选中样式源的图层结构',
  '把道路图层改成更亮的蓝色',
];

const models: ModelOption[] = [
  {
    chef: 'Moonshot',
    chefSlug: 'moonshotai',
    id: 'kimi-k2-thinking',
    name: 'Kimi K2 Thinking',
    providers: ['moonshotai'],
  },
  {
    chef: 'Moonshot',
    chefSlug: 'moonshotai',
    id: 'kimi-k2.5',
    name: 'Kimi K2.5',
    providers: ['moonshotai'],
  },
  {
    chef: 'Moonshot',
    chefSlug: 'moonshotai',
    id: 'kimi-k2-turbo-preview',
    name: 'Kimi K2 Turbo',
    providers: ['moonshotai'],
  },
  {
    chef: 'Moonshot',
    chefSlug: 'moonshotai',
    id: 'kimi-latest',
    name: 'Kimi Latest',
    providers: ['moonshotai'],
  },
];

interface AttachmentItemProps {
  attachment: {
    id: string;
    type: 'file';
    filename?: string;
    mediaType: string;
    url: string;
  };
  onRemove: (id: string) => void;
}

function AttachmentItem({ attachment, onRemove }: AttachmentItemProps) {
  const handleRemove = useCallback(() => onRemove(attachment.id), [onRemove, attachment.id]);

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
}

function PromptInputAttachmentsDisplay() {
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback((id: string) => attachments.remove(id), [attachments]);

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem attachment={attachment} key={attachment.id} onRemove={handleRemove} />
      ))}
    </Attachments>
  );
}

const roleIcon = (role: ChatMessage['role']) => {
  if (role === 'user') return <User className="size-4" />;
  if (role === 'tool') return <Wrench className="size-4" />;
  return <Bot className="size-4" />;
};

const roleLabel = (role: ChatMessage['role']) => {
  if (role === 'user') return '用户';
  if (role === 'tool') return '工具';
  return '助手';
};

const getStoredValue = (key: string, fallback: string) => {
  if (typeof window === 'undefined') return fallback;
  return window.localStorage.getItem(key) ?? fallback;
};

function PromptSuggestions({ onSelect }: { onSelect: (prompt: string) => void }) {
  return (
    <Suggestions>
      {STARTER_PROMPTS.map((prompt) => (
        <Suggestion key={prompt} onClick={onSelect} suggestion={prompt} />
      ))}
    </Suggestions>
  );
}

export function ChatInterface({ getMap, onClose }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [model, setModel] = useState(() => getStoredValue(MODEL_STORAGE_KEY, models[0].id));
  const [apiKey, setApiKey] = useState(() =>
    getStoredValue(API_KEY_STORAGE_KEY, defaultMoonshotApiKey)
  );
  const [draftInput, setDraftInput] = useState('');
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [status, setStatus] = useState<ChatStatus>('ready');

  const modelMessagesRef = useRef<ModelMessage[]>([]);
  const effectiveApiKey = apiKey.trim();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);
  }, [model]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(API_KEY_STORAGE_KEY, apiKey);
  }, [apiKey]);

  const selectedModelData = useMemo(() => models.find((m) => m.id === model), [model]);

  const handleModelSelect = useCallback((id: string) => {
    setModel(id);
    setModelSelectorOpen(false);
  }, []);

  const upsertAssistantMessage = (
    assistantMessageId: string,
    updater: (current: ChatMessage | undefined) => ChatMessage
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
      const prompt = message.text?.trim() ?? '';
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
            role: 'assistant',
            content: '请先输入 API Key（会保存在浏览器 localStorage）。',
          },
        ]);
        return;
      }

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'user',
          content: prompt || '[附件消息]',
        },
      ]);

      setStatus('submitted');

      const provider = createMoonshotClient(effectiveApiKey);

      try {
        const newUserModelMessage: ModelMessage = {
          role: 'user',
          content: prompt || '请处理附带的文件。',
        };
        const assistantMessageId = crypto.randomUUID();

        const result = await streamText({
          model: provider(model),
          system:
            'You are a MapLibre style assistant. ' +
            'You must support ALL currently loaded layers, including basemap layers from style.json. ' +
            'Always call listAllLayers first when user does not provide exact layer id. ' +
            'Use inspectLayerStyle before changing unfamiliar layers. ' +
            'For arbitrary layers use setLayerPaintProperty/setLayerLayoutProperty/setLayerVisibility. ' +
            'After tool calls, provide a concise confirmation.',
          messages: [...modelMessagesRef.current, newUserModelMessage],
          tools: createMapLibreStyleTools({ getMap }),
          stopWhen: stepCountIs(6),
          providerOptions: {
            moonshotai: {
              thinking: {
                type: 'enabled',
                budgetTokens: 4096,
              },
              reasoningHistory: 'interleaved',
            },
          },
        });

        setStatus('streaming');

        let fullResponse = '';
        let fullReasoning = '';

        for await (const delta of result.fullStream) {
          if (delta.type === 'reasoning-start') {
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: 'assistant',
              content: current?.content ?? '',
              reasoning: current?.reasoning ?? '',
              reasoningStreaming: true,
            }));
          } else if (delta.type === 'reasoning-delta') {
            fullReasoning += delta.text;
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: 'assistant',
              content: current?.content ?? '',
              reasoning: fullReasoning,
              reasoningStreaming: true,
            }));
          } else if (delta.type === 'reasoning-end') {
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: 'assistant',
              content: current?.content ?? '',
              reasoning: current?.reasoning ?? fullReasoning,
              reasoningStreaming: false,
            }));
          } else if (delta.type === 'text-delta') {
            fullResponse += delta.text;
            upsertAssistantMessage(assistantMessageId, (current) => ({
              id: assistantMessageId,
              role: 'assistant',
              content: fullResponse,
              reasoning: current?.reasoning ?? fullReasoning,
              reasoningStreaming: current?.reasoningStreaming ?? false,
            }));
          } else if (delta.type === 'tool-call') {
            setMessages((prev) => [
              ...prev,
              {
                id: crypto.randomUUID(),
                role: 'tool',
                content: '',
                tool: {
                  toolCallId: delta.toolCallId,
                  toolName: delta.toolName,
                  input: delta.input,
                  state: 'input-available',
                },
              },
            ]);
          } else if (delta.type === 'tool-result') {
            setMessages((prev) =>
              prev.map((msg) => {
                if (!msg.tool || msg.tool.toolCallId !== delta.toolCallId) return msg;
                const output = delta.output as { success?: boolean; message?: string } | undefined;
                const success = output?.success !== false;
                return {
                  ...msg,
                  tool: {
                    ...msg.tool,
                    output: delta.output,
                    state: success ? 'output-available' : 'output-error',
                    errorText: success ? undefined : output?.message ?? '工具执行失败',
                  },
                };
              })
            );
          }
        }

        const finalResponse = await result.response;
        modelMessagesRef.current = [
          ...modelMessagesRef.current,
          newUserModelMessage,
          ...finalResponse.messages,
        ];

        const finalReasoning = await result.reasoningText;
        if (finalReasoning && finalReasoning.trim()) {
          upsertAssistantMessage(assistantMessageId, (current) => ({
            id: assistantMessageId,
            role: 'assistant',
            content: current?.content ?? fullResponse,
            reasoning: finalReasoning,
            reasoningStreaming: false,
          }));
        }

        setStatus('ready');
      } catch (error) {
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: 'assistant',
            content: `错误：${error instanceof Error ? error.message : '未知错误'}`,
          },
        ]);
        setStatus('error');
      }
    },
    [effectiveApiKey, getMap, model]
  );

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border bg-background shadow-xs">
      <div className="flex flex-col gap-3 border-b px-4 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <div className="font-medium">AI 助手</div>
            <div className="text-sm text-muted-foreground">
              使用 AI 对话组件查看、分析并编辑当前激活的地图样式。
            </div>
          </div>
          {onClose ? (
            <Button aria-label="关闭 AI 助手" onClick={onClose} size="icon-sm" type="button" variant="ghost">
              <X className="size-4" />
            </Button>
          ) : null}
        </div>

        <InputGroup>
          <InputGroupAddon>
            <InputGroupText>
              <KeyRound />
            </InputGroupText>
          </InputGroupAddon>
          <InputGroupInput
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="输入 API Key"
            autoComplete="off"
          />
        </InputGroup>
      </div>

      <div className="flex min-h-0 flex-1 flex-col">
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

                    <PromptSuggestions onSelect={setDraftInput} />
                  </div>
                </ConversationEmptyState>
              ) : (
                messages.map((msg) => (
                  <Message from={msg.role === 'user' ? 'user' : 'assistant'} key={msg.id}>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {roleIcon(msg.role)}
                      <span>{roleLabel(msg.role)}</span>
                    </div>

                    <MessageContent>
                      {msg.role === 'assistant' && msg.reasoning ? (
                        <Reasoning isStreaming={Boolean(msg.reasoningStreaming)}>
                          <ReasoningTrigger />
                          <ReasoningContent>{msg.reasoning}</ReasoningContent>
                        </Reasoning>
                      ) : null}

                      {msg.role === 'tool' && msg.tool ? (
                        <Tool defaultOpen={false}>
                          <ToolHeader type="dynamic-tool" toolName={msg.tool.toolName} state={msg.tool.state} />
                          <ToolContent>
                            <ToolInput input={msg.tool.input} />
                            <ToolOutput output={msg.tool.output} errorText={msg.tool.errorText} />
                          </ToolContent>
                        </Tool>
                      ) : null}

                      {msg.content ? <MessageResponse>{msg.content}</MessageResponse> : null}
                    </MessageContent>
                  </Message>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="border-t px-4 py-4">
            <div className="flex flex-col gap-3">
              {messages.length > 0 ? <PromptSuggestions onSelect={setDraftInput} /> : null}

              <PromptInput
                globalDrop
                multiple
                onSubmit={async (message) => {
                  setDraftInput('');
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

                    <ModelSelector onOpenChange={setModelSelectorOpen} open={modelSelectorOpen}>
                      <ModelSelectorTrigger
                        render={
                          <Button className="h-8 min-w-36 justify-between" size="sm" type="button" variant="outline">
                            {selectedModelData?.chefSlug ? (
                              <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                            ) : null}
                            {selectedModelData?.name ? (
                              <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
                            ) : null}
                          </Button>
                        }
                      />

                      <ModelSelectorContent>
                        <ModelSelectorInput placeholder="搜索模型..." />
                        <ModelSelectorList>
                          <ModelSelectorEmpty>没有找到模型。</ModelSelectorEmpty>
                          {['Moonshot'].map((chef) => (
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
                                    <ModelSelectorName>{m.name}</ModelSelectorName>
                                    <ModelSelectorLogoGroup>
                                      {m.providers.map((provider) => (
                                        <ModelSelectorLogo key={provider} provider={provider} />
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
                  </PromptInputTools>

                  <PromptInputSubmit status={status} disabled={!effectiveApiKey} />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
      </div>
    </div>
  );
}
