import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { installIOSViewportFix } from './utils/iosViewportFix';

// Before the first render, so the app is full height from the start.
installIOSViewportFix();

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// PWA: installable app + offline UI shell. Production builds only, so the dev
// server is never served stale files. Needs HTTPS (or localhost).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .catch((error) => console.warn("Không đăng ký được service worker:", error));
  });
}
