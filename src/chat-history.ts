import type { ModelMessage } from 'ai';

interface CompactDiffEntry {
  path?: unknown;
  before?: unknown;
  after?: unknown;
}

interface CompactToolOutput {
  success?: boolean;
  message?: string;
  data?: {
    changedLayers?: unknown;
    diffSummary?: unknown;
    revisionId?: unknown;
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const asStringArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((item) => typeof item === 'string') : [];

const asDiffEntries = (value: unknown): CompactDiffEntry[] =>
  Array.isArray(value) ? value.filter(isRecord) : [];

const trimTerminalPeriod = (value: string): string => value.replace(/\.+$/u, '');

export const summarizeCompactToolResult = (output: CompactToolOutput): string => {
  const message = trimTerminalPeriod(
    output.message ?? (output.success === false ? 'Tool failed.' : 'Tool completed.')
  );
  const changedLayers = asStringArray(output.data?.changedLayers);
  const diffSummary = asDiffEntries(output.data?.diffSummary);
  const revisionId =
    typeof output.data?.revisionId === 'string' ? output.data.revisionId : undefined;

  const parts = [`Tool result: ${message}`];
  if (revisionId) {
    parts.push(`Revision: ${revisionId}`);
  }
  if (changedLayers.length > 0) {
    parts.push(`Changed layers: ${changedLayers.join(', ')}`);
  }
  if (diffSummary.length > 0) {
    parts.push(
      `Diff: ${diffSummary
        .slice(0, 12)
        .map(
          (entry) =>
            `${String(entry.path)}: ${JSON.stringify(entry.before)} -> ${JSON.stringify(entry.after)}`
        )
        .join('; ')}`
    );
  }
  return `${parts.join('. ')}.`;
};

export const compactModelHistory = (
  previousMessages: ModelMessage[],
  nextMessages: ModelMessage[],
  maxMessages = 10
): ModelMessage[] => [...previousMessages, ...nextMessages].slice(-maxMessages);
