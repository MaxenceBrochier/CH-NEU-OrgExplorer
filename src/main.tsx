import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import './index.css';

// Measure performance
if (import.meta.env.DEV) {
  if ('performance' in window) {
    window.addEventListener('load', () => {
      const metrics = window.performance.timing;
      const pageLoadTime = metrics.loadEventEnd - metrics.navigationStart;
      console.log(`Page Load Time: ${pageLoadTime}ms`);
    });
  }
}

async function bootstrap() {
  try {
    const { initialize } = await import('@microsoft/power-apps/app');
    await initialize();
  } catch {
    // Running outside the Power Apps host (plain `npm run dev`) — keep going.
  }

  const root = document.getElementById('root');
  if (!root) {
    console.error('Root element not found');
    return;
  }

  createRoot(root).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

void bootstrap();
