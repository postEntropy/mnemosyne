import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary.tsx'
import { preloadCriticalAssets } from './utils/assets'
import './index.css'

// Preload Google Fonts and paper texture with fallback handling
preloadCriticalAssets()

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
