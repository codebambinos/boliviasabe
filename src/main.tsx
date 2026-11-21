// Base styles first, so component styles (imported by the components) can override them.
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
// The DOM provider wires flushSync, which view transitions need to snapshot the new screen
import { RouterProvider } from 'react-router/dom';
import { registerSW } from 'virtual:pwa-register';
// Catches the install prompt before any screen mounts (SPEC 16)
import './pwa/install';
import { persistOptions } from './data/persist';
import { queryClient } from './data/query';
import { router } from './router';

// The service worker only in production builds (SPEC 16): in development it would hide changes from HMR.
if (import.meta.env.PROD) registerSW({ immediate: true });

// A tapped notification while the app is open: go to its question or letrero without reloading (src/sw.ts)
navigator.serviceWorker?.addEventListener('message', (event: MessageEvent<{ type?: string; url?: string }>) => {
  if (event.data?.type === 'bs-open' && typeof event.data.url === 'string' && event.data.url.startsWith('/')) {
    void router.navigate(event.data.url);
  }
});

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <RouterProvider router={router} />
    </PersistQueryClientProvider>
  </StrictMode>,
);
