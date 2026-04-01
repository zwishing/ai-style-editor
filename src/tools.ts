import { createMoonshotAI } from '@ai-sdk/moonshotai';
import type { MapStyleState } from './types';

const moonshotBaseURL =
  import.meta.env.VITE_MOONSHOT_BASE_URL || 'https://api.moonshot.cn/v1';

export const DEMO_STYLE_URL = 'https://demotiles.maplibre.org/style.json';

export const defaultMapStyleState: MapStyleState = {
  point: {
    color: '#f97316',
    radius: 5,
    opacity: 0.85,
  },
  line: {
    color: '#2563eb',
    width: 1.8,
    opacity: 0.9,
  },
  fill: {
    color: '#14b8a6',
    opacity: 0.45,
  },
};

export const defaultMoonshotApiKey =
  import.meta.env.VITE_MOONSHOT_API_KEY || import.meta.env.VITE_MINIMAX_API_KEY || '';

export function createMoonshotClient(apiKey?: string, baseURL: string = moonshotBaseURL) {
  return createMoonshotAI({
    apiKey: apiKey && apiKey.trim().length > 0 ? apiKey.trim() : undefined,
    baseURL,
  });
}

