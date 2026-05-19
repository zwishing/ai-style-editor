export interface StyleHistory<TStyle> {
  past: TStyle[];
  present: TStyle;
  future: TStyle[];
}

const DEFAULT_HISTORY_LIMIT = 50;

const cloneSnapshot = <TStyle>(style: TStyle): TStyle =>
  JSON.parse(JSON.stringify(style)) as TStyle;

const snapshotKey = (style: unknown): string => JSON.stringify(style);

export const createStyleHistory = <TStyle>(
  initialStyle: TStyle,
): StyleHistory<TStyle> => ({
  past: [],
  present: cloneSnapshot(initialStyle),
  future: [],
});

export const recordStyleHistoryChange = <TStyle>(
  history: StyleHistory<TStyle>,
  nextStyle: TStyle,
  limit = DEFAULT_HISTORY_LIMIT,
): StyleHistory<TStyle> => {
  if (snapshotKey(history.present) === snapshotKey(nextStyle)) {
    return history;
  }

  return {
    past: [...history.past, cloneSnapshot(history.present)].slice(-limit),
    present: cloneSnapshot(nextStyle),
    future: [],
  };
};

export const replaceStyleHistoryPresent = <TStyle>(
  history: StyleHistory<TStyle>,
  nextStyle: TStyle,
): StyleHistory<TStyle> => ({
  ...history,
  present: cloneSnapshot(nextStyle),
});

export const canUndoStyleHistory = <TStyle>(
  history: StyleHistory<TStyle>,
): boolean => history.past.length > 0;

export const canRedoStyleHistory = <TStyle>(
  history: StyleHistory<TStyle>,
): boolean => history.future.length > 0;

export const undoStyleHistory = <TStyle>(
  history: StyleHistory<TStyle>,
): { history: StyleHistory<TStyle>; style: TStyle } => {
  if (!canUndoStyleHistory(history)) {
    return { history, style: cloneSnapshot(history.present) };
  }

  const previous = history.past.at(-1) as TStyle;
  const nextHistory = {
    past: history.past.slice(0, -1),
    present: cloneSnapshot(previous),
    future: [cloneSnapshot(history.present), ...history.future],
  };

  return { history: nextHistory, style: cloneSnapshot(previous) };
};

export const redoStyleHistory = <TStyle>(
  history: StyleHistory<TStyle>,
): { history: StyleHistory<TStyle>; style: TStyle } => {
  if (!canRedoStyleHistory(history)) {
    return { history, style: cloneSnapshot(history.present) };
  }

  const next = history.future[0] as TStyle;
  const nextHistory = {
    past: [...history.past, cloneSnapshot(history.present)],
    present: cloneSnapshot(next),
    future: history.future.slice(1),
  };

  return { history: nextHistory, style: cloneSnapshot(next) };
};

export const serializeStyleForExport = (style: unknown): string =>
  `${JSON.stringify(style, null, 2)}\n`;

export const getExportStyleFilename = (sourceName?: string | null): string => {
  const slug = (sourceName ?? '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-');

  return `${slug || 'map-style'}-style.json`;
};
