import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { GripVertical } from 'lucide-react';
import { ChatInterface } from './ChatInterface';
import { MapStylePreview } from './MapStylePreview';
import {
  type StyleWorkbenchContext,
  createInitialStyleWorkbenchContext,
} from './style-workbench-state';

const AI_PANEL_MIN_WIDTH = 360;
const AI_PANEL_MAX_MARGIN = 32;

function App() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiPanelWidth, setAiPanelWidth] = useState<number | null>(null);
  const [workbenchContext, setWorkbenchContext] =
    useState<StyleWorkbenchContext>(() => createInitialStyleWorkbenchContext());

  const handleMapReady = useCallback((map: MapLibreMap | null) => {
    mapRef.current = map;
  }, []);

  const getMap = useCallback(() => mapRef.current, []);
  const getWorkbenchContext = useCallback(() => workbenchContext, [workbenchContext]);
  const handleAiPanelResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const panel = event.currentTarget.parentElement;

      if (!panel) {
        return;
      }

      event.preventDefault();

      const startX = event.clientX;
      const startWidth = panel.getBoundingClientRect().width;
      const maxWidth = Math.max(
        AI_PANEL_MIN_WIDTH,
        window.innerWidth - AI_PANEL_MAX_MARGIN
      );

      document.body.style.cursor = 'ew-resize';
      document.body.style.userSelect = 'none';

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const nextWidth = startWidth + startX - moveEvent.clientX;

        setAiPanelWidth(
          Math.min(maxWidth, Math.max(AI_PANEL_MIN_WIDTH, nextWidth))
        );
      };

      const handlePointerUp = () => {
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      window.addEventListener('pointermove', handlePointerMove);
      window.addEventListener('pointerup', handlePointerUp, { once: true });
    },
    []
  );

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <MapStylePreview
        onMapReady={handleMapReady}
        onOpenAi={() => setAiOpen(true)}
        onWorkbenchContextChange={setWorkbenchContext}
      />

      {aiOpen ? (
        <div className="pointer-events-none fixed inset-0 z-20">
          <div
            className="pointer-events-auto absolute top-4 right-4 bottom-4 w-[calc(100vw-2rem)] sm:w-[36rem] lg:w-[44rem]"
            style={aiPanelWidth ? { width: aiPanelWidth } : undefined}
          >
            <div
              aria-label="Resize AI assistant panel"
              aria-orientation="vertical"
              className="absolute top-1/2 left-0 z-10 flex h-8 w-3 -translate-x-1/2 -translate-y-1/2 cursor-ew-resize items-center justify-center rounded-full border bg-background/95 text-muted-foreground shadow-sm transition-colors hover:border-ring hover:text-foreground active:bg-muted"
              onPointerDown={handleAiPanelResizeStart}
              role="separator"
            >
              <GripVertical className="pointer-events-none size-3.5" />
            </div>
            <ChatInterface
              getMap={getMap}
              getWorkbenchContext={getWorkbenchContext}
              onClose={() => setAiOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default App;
