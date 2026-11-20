// Picks the adapter behind the hooks. VITE_DATA_SOURCE=mock|supabase (default: mock).
// The Supabase adapter arrives in SPEC 02; until then every value falls back to the mock.
import type { DataApi } from './api';
import { mockAdapter } from './mock/adapter';

function pickAdapter(): DataApi {
  const source = import.meta.env.VITE_DATA_SOURCE as string | undefined;
  if (source && source !== 'mock') {
    console.warn(`VITE_DATA_SOURCE="${source}" is not available yet (Supabase adapter: SPEC 02). Using the mock adapter.`);
  }
  return mockAdapter;
}

export const api: DataApi = pickAdapter();
