import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { isNativePlatform } from './utils/capacitor';
import { setupNetworkListener } from './utils/network';

if (import.meta.env.VITE_ENABLE_LICENSE_KEY) {
  // Third-party license script pinned with SRI: the exact file content is
  // hashed, so a compromised/drifting CDN payload is rejected by the browser.
  const SRI_HASH = 'sha384-D8x+7gGA+BHMQbW719hHf31pgDbaXiODUPaqyL2MAeGpRGJ5T5cLHU8t35Ek7h3z';
  const script = document.createElement('script');
  script.src = `https://cdn.enable.co.il/licenses/${import.meta.env.VITE_ENABLE_LICENSE_KEY}/init.js`;
  script.integrity = SRI_HASH;
  script.crossOrigin = 'anonymous';
  document.head.appendChild(script);
}

async function bootstrap() {
  if (isNativePlatform()) {
    try {
      await setupNetworkListener();
    } catch (err) {
      console.warn('Network listener setup failed, continuing anyway:', err);
    }
  }

  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}

bootstrap();
