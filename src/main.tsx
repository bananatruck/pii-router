import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

function Placeholder() {
  return <p>PII Router is being built.</p>;
}

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <Placeholder />
    </StrictMode>,
  );
}
