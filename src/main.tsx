// Base styles first, so component styles (imported by the components) can override them.
import './styles/tokens.css';
import './styles/app.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
// The DOM provider wires flushSync, which view transitions need to snapshot the new screen
import { RouterProvider } from 'react-router/dom';
import { queryClient } from './data/query';
import { router } from './router';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element in index.html');

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
