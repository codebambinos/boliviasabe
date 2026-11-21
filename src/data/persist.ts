// The last loaded data, kept on the device so the app opens without signal and shows it (SPEC 16, wiki #197).
// The TanStack Query cache is saved to IndexedDB for 24 h. A new build discards it (buster). Nothing personal
// (balance, movements, activity, saved, phone) and nothing about the session is ever written; signing out removes
// the copy (hooks/session.ts).
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { isPersonalKey } from './query';

export const persister = createAsyncStoragePersister({
  storage: {
    getItem: (key) => get<string>(key),
    setItem: (key, value) => set(key, value),
    removeItem: (key) => del(key),
  },
  key: 'bs-query-cache',
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister,
  maxAge: 24 * 60 * 60 * 1000,
  buster: __APP_VERSION__,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) =>
      defaultShouldDehydrateQuery(query) && !isPersonalKey(query.queryKey) && query.queryKey[1] !== 'session',
  },
};
