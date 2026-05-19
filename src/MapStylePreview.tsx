import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import {
  Bot,
  Check,
  Circle,
  Download,
  Layers3,
  Loader2,
  Plus,
  Redo2,
  Slash,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from "lucide-react";
import { DEMO_STYLE_URL } from "./tools";
import { Alert, AlertDescription, AlertTitle } from "./components/ui/alert";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
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
} from "./components/ui/dialog";
import { Input } from "./components/ui/input";
import { InputGroup, InputGroupInput } from "./components/ui/input-group";
import { ScrollArea } from "./components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import {
  createInitialStyleWorkbenchContext,
  nextStyleRevision,
  type StyleWorkbenchContext,
  updateStyleWorkbenchContext,
} from "./style-workbench-state";
import {
  canRedoStyleHistory,
  canUndoStyleHistory,
  createStyleHistory,
  getExportStyleFilename,
  recordStyleHistoryChange,
  replaceStyleHistoryPresent,
  redoStyleHistory,
  serializeStyleForExport,
  type StyleHistory,
  undoStyleHistory,
} from "./style-history";
import "maplibre-gl/dist/maplibre-gl.css";

interface MapStylePreviewProps {
  onMapReady?: (map: maplibregl.Map | null) => void;
  onOpenAi?: () => void;
  onWorkbenchContextChange?: (context: StyleWorkbenchContext) => void;
}

interface LayerPanelItem {
  id: string;
  type: string;
  source?: string;
  sourceLayer?: string;
}

interface StyleSourceItem {
  id: string;
  name: string;
  input: string;
  layerCount: number;
  style: StyleSpecification;
  history: StyleHistory<StyleSpecification>;
  locked: boolean;
}

interface ImportStyleSourceOptions {
  input: string;
  name: string;
  mapInstance?: maplibregl.Map;
  signal?: AbortSignal;
  sourceId?: string;
  locked?: boolean;
  openPanelOnSuccess?: boolean;
}

const DEFAULT_SOURCE_ID = "default-style-source";
const DEFAULT_SOURCE_NAME = "默认源";

const EMPTY_BASE_STYLE: StyleSpecification = {
  version: 8,
  projection: { type: "mercator" },
  sources: {},
  layers: [],
};

const cloneStyle = (style: StyleSpecification): StyleSpecification =>
  JSON.parse(JSON.stringify(style)) as StyleSpecification;

const normalizeRemoteStyle = (rawStyle: unknown): StyleSpecification => {
  if (
    typeof rawStyle !== "object" ||
    rawStyle === null ||
    Array.isArray(rawStyle)
  ) {
    throw new Error("样式 JSON 格式无效，必须是对象。");
  }

  const styleRecord = rawStyle as Record<string, unknown>;
  const normalizedStyle: Record<string, unknown> = {
    ...styleRecord,
    version: typeof styleRecord.version === "number" ? styleRecord.version : 8,
  };

  if (
    !("projection" in normalizedStyle) ||
    normalizedStyle.projection == null
  ) {
    normalizedStyle.projection = { type: "mercator" };
  }

  return normalizedStyle as StyleSpecification;
};

const resolveStyleInput = async (
  rawInput: string,
  signal?: AbortSignal,
): Promise<StyleSpecification> => {
  const input = rawInput.trim();
  if (!input) {
    throw new Error("请输入 style.json 地址。");
  }

  const response = await fetch(input, { signal });
  if (!response.ok) {
    throw new Error(`加载 style.json 失败：${response.status}`);
  }

  return normalizeRemoteStyle(await response.json());
};

const collectLayerPanelItems = (style: StyleSpecification): LayerPanelItem[] =>
  (style.layers ?? []).map((layer) => ({
    id: layer.id,
    type: layer.type,
    source: "source" in layer ? layer.source : undefined,
    sourceLayer: "source-layer" in layer ? layer["source-layer"] : undefined,
  }));

const getLayerTypeIcon = (type: string) => {
  if (type === "line") return Slash;
  if (
    type === "fill" ||
    type === "fill-extrusion" ||
    type === "raster" ||
    type === "background"
  ) {
    return Square;
  }
  if (type === "symbol") return Type;
  return Circle;
};

export function MapStylePreview({
  onMapReady,
  onOpenAi,
  onWorkbenchContextChange,
}: MapStylePreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const styleSourcesRef = useRef<StyleSourceItem[]>([]);
  const activeStyleSourceIdRef = useRef<string | null>(null);
  const historySyncModeRef = useRef<"record" | "replace">("record");
  const workbenchContextRef = useRef<StyleWorkbenchContext>(
    createInitialStyleWorkbenchContext(),
  );

  const [styleSources, setStyleSources] = useState<StyleSourceItem[]>([]);
  const [activeStyleSourceId, setActiveStyleSourceId] = useState<string | null>(
    null,
  );
  const [layers, setLayers] = useState<LayerPanelItem[]>([]);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [layerFilter, setLayerFilter] = useState("");
  const [styleLoadStatus, setStyleLoadStatus] = useState("默认源已加载。");
  const [styleLoadError, setStyleLoadError] = useState(false);
  const [isStyleLoading, setIsStyleLoading] = useState(false);
  const [panelTab, setPanelTab] = useState("sources");
  const [panelOpen, setPanelOpen] = useState(false);
  const [sourceDialogOpen, setSourceDialogOpen] = useState(false);
  const [draftSourceName, setDraftSourceName] = useState("");
  const [draftSourceUrl, setDraftSourceUrl] = useState("");

  const updateStyleSources = useCallback(
    (updater: (sources: StyleSourceItem[]) => StyleSourceItem[]) => {
      setStyleSources((prev) => {
        const next = updater(prev);
        styleSourcesRef.current = next;
        return next;
      });
    },
    [],
  );

  const publishWorkbenchContext = useCallback(
    (context: StyleWorkbenchContext) => {
      workbenchContextRef.current = context;
      onWorkbenchContextChange?.(context);
    },
    [onWorkbenchContextChange],
  );

  useEffect(() => {
    styleSourcesRef.current = styleSources;
  }, [styleSources]);

  useEffect(() => {
    activeStyleSourceIdRef.current = activeStyleSourceId;
  }, [activeStyleSourceId]);

  const setActiveStyleSource = useCallback(
    (sourceId: string | null) => {
      activeStyleSourceIdRef.current = sourceId;
      setActiveStyleSourceId(sourceId);
      publishWorkbenchContext(
        updateStyleWorkbenchContext(workbenchContextRef.current, {
          activeSourceId: sourceId,
        }),
      );
    },
    [publishWorkbenchContext],
  );

  const syncCurrentMapStyle = useCallback(
    (map: maplibregl.Map) => {
      const currentStyle = map.getStyle();
      if (!currentStyle) {
        setLayers([]);
        return;
      }

      const normalizedStyle = cloneStyle(currentStyle as StyleSpecification);
      const nextLayers = collectLayerPanelItems(normalizedStyle);
      setLayers(nextLayers);

      const activeId = activeStyleSourceIdRef.current;
      if (!activeId) {
        return;
      }

      const historySyncMode = historySyncModeRef.current;
      historySyncModeRef.current = "record";
      updateStyleSources((prev) =>
        prev.map((source) =>
          source.id === activeId
            ? (() => {
                const history =
                  historySyncMode === "replace"
                    ? replaceStyleHistoryPresent(
                        source.history,
                        normalizedStyle,
                      )
                    : recordStyleHistoryChange(source.history, normalizedStyle);
                return {
                  ...source,
                  layerCount: nextLayers.length,
                  style: history.present,
                  history,
                };
              })()
            : source,
        ),
      );
      publishWorkbenchContext(nextStyleRevision(workbenchContextRef.current));
    },
    [publishWorkbenchContext, updateStyleSources],
  );

  const activateStyleSource = useCallback(
    (sourceId: string) => {
      const map = mapRef.current;
      const source = styleSourcesRef.current.find(
        (item) => item.id === sourceId,
      );
      if (!map || !source) {
        return;
      }

      setActiveStyleSource(sourceId);
      setPanelTab("layers");
      setStyleLoadError(false);
      setPanelOpen(true);
      setStyleLoadStatus(`已切换到 ${source.name}。`);
      historySyncModeRef.current = "replace";
      map.setStyle(cloneStyle(source.style), { diff: false });
    },
    [setActiveStyleSource],
  );

  const importStyleSource = useCallback(
    async ({
      input,
      name,
      mapInstance,
      signal,
      sourceId,
      locked = false,
      openPanelOnSuccess = true,
    }: ImportStyleSourceOptions): Promise<boolean> => {
      const map = mapInstance ?? mapRef.current;
      if (!map) {
        setStyleLoadError(true);
        setStyleLoadStatus("地图尚未准备完成，请稍后重试。");
        return false;
      }

      const trimmedInput = input.trim();
      const trimmedName = name.trim();

      if (!trimmedName) {
        setStyleLoadError(true);
        setStyleLoadStatus("请输入源名称。");
        return false;
      }

      setIsStyleLoading(true);
      setStyleLoadError(false);
      setStyleLoadStatus("正在加载 style.json...");

      try {
        const normalizedStyle = await resolveStyleInput(trimmedInput, signal);
        const nextId = sourceId ?? crypto.randomUUID();
        const nextItem: StyleSourceItem = {
          id: nextId,
          name: trimmedName,
          input: trimmedInput,
          layerCount: normalizedStyle.layers?.length ?? 0,
          style: normalizedStyle,
          history: createStyleHistory(normalizedStyle),
          locked,
        };

        updateStyleSources((prev) => {
          if (prev.some((source) => source.id === nextId)) {
            return prev.map((source) =>
              source.id === nextId ? nextItem : source,
            );
          }
          return [...prev, nextItem];
        });

        setActiveStyleSource(nextId);
        if (openPanelOnSuccess) {
          setPanelOpen(true);
        }
        historySyncModeRef.current = "replace";
        map.setStyle(cloneStyle(normalizedStyle), { diff: false });
        setStyleLoadStatus(`已添加 ${trimmedName}。`);
        return true;
      } catch (error) {
        if (signal?.aborted) {
          return false;
        }
        setStyleLoadError(true);
        setStyleLoadStatus(
          `加载失败：${error instanceof Error ? error.message : "未知错误"}`,
        );
        return false;
      } finally {
        if (!signal?.aborted) {
          setIsStyleLoading(false);
        }
      }
    },
    [setActiveStyleSource, updateStyleSources],
  );

  const handleCreateSource = useCallback(async () => {
    const success = await importStyleSource({
      input: draftSourceUrl,
      name: draftSourceName,
      openPanelOnSuccess: true,
    });

    if (!success) {
      return;
    }

    setDraftSourceName("");
    setDraftSourceUrl("");
    setSourceDialogOpen(false);
    setPanelTab("sources");
  }, [draftSourceName, draftSourceUrl, importStyleSource]);

  const handleRemoveStyleSource = useCallback(
    (sourceId: string) => {
      const targetSource = styleSourcesRef.current.find(
        (source) => source.id === sourceId,
      );
      if (!targetSource || targetSource.locked) {
        return;
      }

      const nextSources = styleSourcesRef.current.filter(
        (source) => source.id !== sourceId,
      );
      updateStyleSources(() => nextSources);

      if (activeStyleSourceIdRef.current !== sourceId) {
        setStyleLoadError(false);
        setStyleLoadStatus(`已删除 ${targetSource.name}。`);
        return;
      }

      const nextActive = nextSources[0] ?? null;
      const map = mapRef.current;

      if (!map || !nextActive) {
        setActiveStyleSource(null);
        setLayers([]);
        setSelectedLayerId(null);
        historySyncModeRef.current = "replace";
        map?.setStyle(cloneStyle(EMPTY_BASE_STYLE), { diff: false });
        setStyleLoadError(false);
        setStyleLoadStatus("当前没有已加载的样式源。");
        return;
      }

      setActiveStyleSource(nextActive.id);
      historySyncModeRef.current = "replace";
      map.setStyle(cloneStyle(nextActive.style), { diff: false });
      setStyleLoadError(false);
      setStyleLoadStatus(
        `已删除 ${targetSource.name}，并切换到 ${nextActive.name}。`,
      );
    },
    [setActiveStyleSource, updateStyleSources],
  );

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const abortController = new AbortController();
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: EMPTY_BASE_STYLE,
      center: [-74.006, 40.7128],
      zoom: 11.8,
      hash: false,
    });

    mapRef.current = map;
    onMapReady?.(map);
    map.addControl(new maplibregl.NavigationControl(), "top-right");

    const handleStyleChange = () => syncCurrentMapStyle(map);
    map.on("load", handleStyleChange);
    map.on("style.load", handleStyleChange);
    map.on("styledata", handleStyleChange);

    void importStyleSource({
      input: DEMO_STYLE_URL,
      name: DEFAULT_SOURCE_NAME,
      mapInstance: map,
      signal: abortController.signal,
      sourceId: DEFAULT_SOURCE_ID,
      locked: true,
      openPanelOnSuccess: false,
    });

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

    return () => {
      abortController.abort();
      resizeObserver.disconnect();
      map.off("load", handleStyleChange);
      map.off("style.load", handleStyleChange);
      map.off("styledata", handleStyleChange);
      onMapReady?.(null);
      map.remove();
      mapRef.current = null;
    };
  }, [importStyleSource, onMapReady, syncCurrentMapStyle]);

  const activeStyleSource = useMemo(
    () =>
      styleSources.find((source) => source.id === activeStyleSourceId) ?? null,
    [activeStyleSourceId, styleSources],
  );

  const canUndoActiveStyle = activeStyleSource
    ? canUndoStyleHistory(activeStyleSource.history)
    : false;
  const canRedoActiveStyle = activeStyleSource
    ? canRedoStyleHistory(activeStyleSource.history)
    : false;

  const applyHistoryResult = useCallback(
    (
      sourceId: string,
      result: {
        history: StyleHistory<StyleSpecification>;
        style: StyleSpecification;
      },
      statusMessage: string,
    ) => {
      const map = mapRef.current;
      if (!map) {
        return;
      }

      updateStyleSources((prev) =>
        prev.map((source) =>
          source.id === sourceId
            ? {
                ...source,
                layerCount: result.style.layers?.length ?? 0,
                style: result.history.present,
                history: result.history,
              }
            : source,
        ),
      );
      historySyncModeRef.current = "replace";
      map.setStyle(cloneStyle(result.style), { diff: false });
      setStyleLoadError(false);
      setStyleLoadStatus(statusMessage);
    },
    [updateStyleSources],
  );

  const handleUndoStyle = useCallback(() => {
    const sourceId = activeStyleSourceIdRef.current;
    const source = styleSourcesRef.current.find((item) => item.id === sourceId);
    if (!source || !canUndoStyleHistory(source.history)) {
      return;
    }

    applyHistoryResult(
      source.id,
      undoStyleHistory(source.history),
      `已撤销 ${source.name} 的上一次样式修改。`,
    );
  }, [applyHistoryResult]);

  const handleRedoStyle = useCallback(() => {
    const sourceId = activeStyleSourceIdRef.current;
    const source = styleSourcesRef.current.find((item) => item.id === sourceId);
    if (!source || !canRedoStyleHistory(source.history)) {
      return;
    }

    applyHistoryResult(
      source.id,
      redoStyleHistory(source.history),
      `已重做 ${source.name} 的样式修改。`,
    );
  }, [applyHistoryResult]);

  const handleExportStyle = useCallback(() => {
    if (!activeStyleSource) {
      return;
    }

    const blob = new Blob([serializeStyleForExport(activeStyleSource.style)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = getExportStyleFilename(activeStyleSource.name);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setStyleLoadError(false);
    setStyleLoadStatus(`已导出 ${activeStyleSource.name}。`);
  }, [activeStyleSource]);

  const filteredLayers = useMemo(() => {
    const keyword = layerFilter.trim().toLowerCase();
    if (!keyword) {
      return layers;
    }

    return layers.filter((layer) => {
      return (
        layer.id.toLowerCase().includes(keyword) ||
        layer.type.toLowerCase().includes(keyword) ||
        layer.source?.toLowerCase().includes(keyword) ||
        layer.sourceLayer?.toLowerCase().includes(keyword)
      );
    });
  }, [layerFilter, layers]);

  useEffect(() => {
    setSelectedLayerId((current) => {
      if (current && filteredLayers.some((layer) => layer.id === current)) {
        return current;
      }
      return filteredLayers[0]?.id ?? null;
    });
  }, [filteredLayers]);

  useEffect(() => {
    publishWorkbenchContext(
      updateStyleWorkbenchContext(workbenchContextRef.current, {
        selectedLayerId,
      }),
    );
  }, [publishWorkbenchContext, selectedLayerId]);

  return (
    <section className="relative h-full w-full bg-background">
      <div className="absolute inset-0">
        <div ref={containerRef} className="h-full w-full" />
      </div>

      <div className="absolute top-4 left-4 z-10 flex items-center gap-2">
        <Button
          onClick={() => setPanelOpen((current) => !current)}
          variant="outline"
        >
          <Layers3 data-icon="inline-start" />
          图层
        </Button>
        <Button
          aria-label="撤销样式修改"
          disabled={!canUndoActiveStyle}
          onClick={handleUndoStyle}
          size="icon"
          type="button"
          variant="outline"
        >
          <Undo2 />
        </Button>
        <Button
          aria-label="重做样式修改"
          disabled={!canRedoActiveStyle}
          onClick={handleRedoStyle}
          size="icon"
          type="button"
          variant="outline"
        >
          <Redo2 />
        </Button>
        <Button
          aria-label="导出当前 style.json"
          disabled={!activeStyleSource}
          onClick={handleExportStyle}
          size="icon"
          type="button"
          variant="outline"
        >
          <Download />
        </Button>
        <Button aria-label="打开 AI 助手" onClick={onOpenAi} size="icon">
          <Bot />
        </Button>
      </div>

      {panelOpen ? (
        <Card className="absolute top-16 bottom-4 left-4 z-10 w-[min(24rem,calc(100vw-2rem))] pt-0">
          <CardHeader className="flex min-h-14 flex-row items-center justify-between gap-3 border-b">
            <CardTitle>图层面板</CardTitle>
            <CardAction className="self-center">
              <Button
                aria-label="关闭图层面板"
                onClick={() => setPanelOpen(false)}
                size="icon"
                type="button"
                variant="ghost"
              >
                <X />
              </Button>
            </CardAction>
          </CardHeader>

          <CardContent className="min-h-0 flex-1">
            <Tabs
              className="flex h-full min-h-0 flex-col gap-4"
              onValueChange={setPanelTab}
              value={panelTab}
            >
              <TabsList>
                <TabsTrigger value="sources">源</TabsTrigger>
                <TabsTrigger value="layers">图层</TabsTrigger>
              </TabsList>

              <TabsContent className="min-h-0 flex-1" value="sources">
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium">已加载的源</div>
                    <Button
                      onClick={() => setSourceDialogOpen(true)}
                      size="sm"
                      variant="outline"
                    >
                      <Plus data-icon="inline-start" />
                      添加源
                    </Button>
                  </div>

                  <Alert variant={styleLoadError ? "destructive" : "default"}>
                    <AlertTitle>
                      {styleLoadError ? "操作失败" : "状态"}
                    </AlertTitle>
                    <AlertDescription>{styleLoadStatus}</AlertDescription>
                  </Alert>

                  <Card className="min-h-0 flex-1" size="sm">
                    <CardContent className="min-h-0 flex-1">
                      <ScrollArea className="h-full">
                        <div className="flex flex-col gap-2">
                          {styleSources.map((source) => {
                            const isActive = activeStyleSourceId === source.id;

                            return (
                              <div
                                className="flex items-center gap-2"
                                key={source.id}
                              >
                                <Button
                                  className="h-auto min-w-0 flex-1 justify-between"
                                  onClick={() => activateStyleSource(source.id)}
                                  type="button"
                                  variant={isActive ? "secondary" : "ghost"}
                                >
                                  <span className="min-w-0 text-left">
                                    <span className="flex items-center gap-2">
                                      <span className="truncate">
                                        {source.name}
                                      </span>
                                      <Badge variant="outline">
                                        {source.layerCount}
                                      </Badge>
                                    </span>
                                    <span className="block truncate text-xs text-muted-foreground">
                                      {source.input}
                                    </span>
                                  </span>

                                  {isActive ? <Check /> : null}
                                </Button>

                                {!source.locked ? (
                                  <Button
                                    aria-label={`删除 ${source.name}`}
                                    onClick={() =>
                                      handleRemoveStyleSource(source.id)
                                    }
                                    size="icon"
                                    type="button"
                                    variant="ghost"
                                  >
                                    <Trash2 />
                                  </Button>
                                ) : null}
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent className="min-h-0 flex-1" value="layers">
                <div className="flex h-full min-h-0 flex-col gap-3">
                  <Card size="sm">
                    <CardContent className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium">
                          {activeStyleSource?.name ?? "当前没有激活的源"}
                        </span>
                        <Badge variant="outline">{filteredLayers.length}</Badge>
                      </div>
                      <InputGroup>
                        <InputGroupInput
                          placeholder="搜索图层"
                          value={layerFilter}
                          onChange={(event) =>
                            setLayerFilter(event.target.value)
                          }
                        />
                      </InputGroup>
                    </CardContent>
                  </Card>

                  <Card className="min-h-0 flex-1" size="sm">
                    <CardHeader>
                      <CardTitle>图层列表</CardTitle>
                    </CardHeader>
                    <CardContent className="min-h-0 flex-1">
                      <ScrollArea className="h-full">
                        <div className="flex flex-col gap-1">
                          {filteredLayers.map((layer) => {
                            const LayerTypeIcon = getLayerTypeIcon(layer.type);
                            return (
                              <Button
                                key={layer.id}
                                className="w-full justify-start"
                                size="sm"
                                type="button"
                                variant={
                                  selectedLayerId === layer.id
                                    ? "secondary"
                                    : "ghost"
                                }
                                onClick={() => setSelectedLayerId(layer.id)}
                              >
                                <LayerTypeIcon />
                                <span className="truncate">{layer.id}</span>
                              </Button>
                            );
                          })}

                          {activeStyleSource && filteredLayers.length === 0 ? (
                            <div className="text-sm text-muted-foreground">
                              当前源没有匹配的图层。
                            </div>
                          ) : null}

                          {!activeStyleSource ? (
                            <div className="text-sm text-muted-foreground">
                              请先激活一个源。
                            </div>
                          ) : null}
                        </div>
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      ) : null}

      <Dialog open={sourceDialogOpen} onOpenChange={setSourceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加源</DialogTitle>
            <DialogDescription>
              输入源名称和 style.json 地址，添加后会立即加载。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">源名称</div>
              <Input
                placeholder="例如：道路样式"
                value={draftSourceName}
                onChange={(event) => setDraftSourceName(event.target.value)}
              />
            </div>

            <div className="flex flex-col gap-2">
              <div className="text-sm font-medium">style.json 地址</div>
              <Input
                placeholder="https://example.com/style.json"
                value={draftSourceUrl}
                onChange={(event) => setDraftSourceUrl(event.target.value)}
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => setSourceDialogOpen(false)}
              type="button"
              variant="outline"
            >
              取消
            </Button>
            <Button
              disabled={isStyleLoading}
              onClick={() => void handleCreateSource()}
              type="button"
            >
              {isStyleLoading ? (
                <>
                  <Loader2 className="animate-spin" data-icon="inline-start" />
                  添加中
                </>
              ) : (
                "添加"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
