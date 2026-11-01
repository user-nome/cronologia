import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from '@zero/renderer/App';
import '@zero/renderer/style/styles.css';

const container = document.getElementById('root');
if (container !== null) {
  createRoot(container).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
