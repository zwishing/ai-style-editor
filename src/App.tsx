import { useCallback, useRef, useState } from 'react';
import type { Map as MapLibreMap } from 'maplibre-gl';
import { ChatInterface } from './ChatInterface';
import { MapStylePreview } from './MapStylePreview';
import {
  createInitialStyleWorkbenchContext,
  type StyleWorkbenchContext,
} from './style-workbench-state';

function App() {
  const mapRef = useRef<MapLibreMap | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [workbenchContext, setWorkbenchContext] =
    useState<StyleWorkbenchContext>(() => createInitialStyleWorkbenchContext());

  const handleMapReady = useCallback((map: MapLibreMap | null) => {
    mapRef.current = map;
  }, []);

  const getMap = useCallback(() => mapRef.current, []);
  const getWorkbenchContext = useCallback(() => workbenchContext, [workbenchContext]);

  return (
    <div className="h-screen w-screen overflow-hidden bg-background text-foreground">
      <MapStylePreview
        onMapReady={handleMapReady}
        onOpenAi={() => setAiOpen(true)}
        onWorkbenchContextChange={setWorkbenchContext}
      />

      {aiOpen ? (
        <div className="pointer-events-none fixed inset-0 z-20">
          <div className="pointer-events-auto absolute top-4 right-4 bottom-4 w-[calc(100vw-2rem)] sm:w-[36rem] lg:w-[44rem]">
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
