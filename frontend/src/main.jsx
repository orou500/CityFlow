import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

if (import.meta.env.VITE_ENABLE_LICENSE_KEY) {
  const script = document.createElement('script');
  script.src = `https://cdn.enable.co.il/licenses/${import.meta.env.VITE_ENABLE_LICENSE_KEY}/init.js`;
  document.head.appendChild(script);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
