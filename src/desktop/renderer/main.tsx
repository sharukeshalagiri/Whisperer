import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App } from './App';
import { ErrorBoundary } from './components';
import './styles.css';

/** Shares cached local-service queries across the renderer lifetime. */
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 10_000,
    },
  },
});

/**
 * Mounts the renderer with its single query cache and error containment.
 *
 * Returns:
 *   Nothing.
 *
 * Raises:
 *   Error: When the expected root element is not present in the packaged document.
 */
function mountRenderer(): void {
  const container = document.getElementById('root');
  if (!container) throw new Error('Renderer root element is missing.');
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <ErrorBoundary><App /></ErrorBoundary>
      </QueryClientProvider>
    </StrictMode>,
  );
}

mountRenderer();
