import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { isNativePlatform } from './utils/capacitor';
import { setupNetworkListener } from './utils/network';

if (import.meta.env.VITE_ENABLE_LICENSE_KEY) {
  const script = document.createElement('script');
  script.src = `https://cdn.enable.co.il/licenses/${import.meta.env.VITE_ENABLE_LICENSE_KEY}/init.js`;
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
