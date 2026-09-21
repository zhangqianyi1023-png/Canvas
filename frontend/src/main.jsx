import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './ErrorBoundary.jsx'
import QuickPromptsProvider from './components/QuickPromptsProvider.jsx'

const app = (
  <ErrorBoundary>
    <QuickPromptsProvider>
      <App />
    </QuickPromptsProvider>
  </ErrorBoundary>
)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {app}
  </StrictMode>,
)
