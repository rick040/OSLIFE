import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)

// Register the service worker so OSLIFE is installable and can receive Android
// share-sheet POSTs (public/sw.js handles /share). Best-effort; ignored on
// browsers without SW support or over insecure origins.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('[OSLIFE] service worker registration failed', err)
    })
  })
}
