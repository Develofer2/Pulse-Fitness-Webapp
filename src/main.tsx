import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { initPwa } from './lib/pwa'
import { applyTheme, useSettings } from './lib/store'

applyTheme(useSettings.getState().theme)
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme(useSettings.getState().theme))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

initPwa()
